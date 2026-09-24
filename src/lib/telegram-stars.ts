import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { prisma } from "@/lib/prisma";
import { calculateMaturityDate, starsToUsd } from "@/lib/financial-engine";

export interface ChannelSyncResult {
  modelId: string;
  channelId: string;
  success: boolean;
  transactionsCount: number;
  totalStars: number;
  overallRevenue?: number;
  availableBalance?: number;
  currentBalance?: number;
  error?: string;
}

export interface AllModelsSyncResult {
  success: boolean;
  syncedModels: number;
  totalTransactions: number;
  totalStars: number;
  channels: ChannelSyncResult[];
  error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Safely extracts the star numeric count from any GramJS / MTProto return structure.
 * GramJS can return primitive number, bigint, or TypeStarsAmount { amount: long, nanos: int }.
 */
export function isStarsNegative(val: any): boolean {
  if (val == null) return false;
  if (typeof val === "number") return val < 0;
  if (typeof val === "bigint") return val < 0n;
  if (typeof val === "string") {
    const n = Number(val);
    return !isNaN(n) && n < 0;
  }
  if (typeof val === "object") {
    if (val.amount != null) return isStarsNegative(val.amount);
    if (val.stars != null) return isStarsNegative(val.stars);
    if (val.value != null) return isStarsNegative(val.value);
    if (typeof val.toString === "function" && val.toString() !== "[object Object]") {
      const n = Number(val.toString());
      return !isNaN(n) && n < 0;
    }
  }
  return false;
}

/**
 * Safely extracts the star numeric count from any GramJS / MTProto return structure.
 * GramJS can return primitive number, bigint, or TypeStarsAmount { amount: long, nanos: int }.
 */
export function extractStarsValue(val: any): number {
  if (val == null) return 0;
  if (typeof val === "number") return Math.abs(val);
  if (typeof val === "bigint") return Math.abs(Number(val));
  if (typeof val === "string") {
    const n = Number(val);
    return isNaN(n) ? 0 : Math.abs(n);
  }
  if (typeof val === "object") {
    if (val.amount != null) {
      return extractStarsValue(val.amount);
    }
    if (val.stars != null) {
      return extractStarsValue(val.stars);
    }
    if (val.value != null) {
      return extractStarsValue(val.value);
    }
    if (typeof val.toString === "function" && val.toString() !== "[object Object]") {
      const n = Number(val.toString());
      if (!isNaN(n)) return Math.abs(n);
    }
  }
  return 0;
}

/**
 * Creates and connects a GramJS MTProto TelegramClient using environment credentials.
 */
export async function createTelegramClient(): Promise<TelegramClient | null> {
  const apiId = Number(process.env.TELEGRAM_API_ID || "0");
  const apiHash = process.env.TELEGRAM_API_HASH || "";
  const sessionString = process.env.TELEGRAM_SESSION_STRING || "";

  if (!apiId || !apiHash || !sessionString) {
    console.warn("[Telegram Stars Engine] MTProto credentials missing in environment.");
    return null;
  }

  try {
    const session = new StringSession(sessionString);
    const client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
    });
    await client.connect();
    return client;
  } catch (err: any) {
    console.error("[Telegram Stars Engine] Failed to connect MTProto client:", err.message);
    return null;
  }
}

/**
 * Robust peer resolution for Telegram channel IDs:
 * Handles strings, numbers, '-100' prefix, and primes GramJS entity cache via getDialogs.
 */
export async function resolveChannelPeer(client: TelegramClient, channelId: string): Promise<any> {
  const cleanId = String(channelId).trim();

  // 1. Try direct resolution from existing client cache
  try {
    const peer = await client.getInputEntity(cleanId);
    if (peer) return peer;
  } catch {}

  // 2. Try parsing numeric
  try {
    const numericOnly = cleanId.replace(/[^0-9-]/g, "");
    if (numericOnly) {
      const peer = await client.getInputEntity(numericOnly as any);
      if (peer) return peer;
    }
  } catch {}

  // 3. Prime entity cache by loading userbot dialogs
  console.log(`[Telegram Stars Engine] Priming entity cache via getDialogs for channel: ${cleanId}...`);
  const dialogs = await client.getDialogs({ limit: 100 });

  // Direct match from dialogs list
  const directMatch = dialogs.find((d) => {
    const dId = String(d.id);
    const entId = String((d.entity as any)?.id || "");
    return (
      dId === cleanId ||
      entId === cleanId ||
      `-100${entId}` === cleanId ||
      cleanId === `-100${dId}` ||
      dId.replace("-100", "") === cleanId.replace("-100", "")
    );
  });

  if (directMatch?.inputEntity) {
    return directMatch.inputEntity;
  }

  if (directMatch?.entity) {
    return await client.getInputEntity(directMatch.entity);
  }

  // 4. Final attempt after cache has been primed
  return await client.getInputEntity(cleanId);
}

/**
 * Fetches all historical and current Telegram Stars transactions for a single channel.
 * Uses MTProto GetStarsTransactions with full pagination (nextOffset loop) and
 * reconciles against GetStarsRevenueStats / GetStarsStatus so no stars are ever lost.
 */
export async function syncStarsForChannel(
  modelId: string,
  telegramChannelId: string,
  options?: { client?: TelegramClient }
): Promise<ChannelSyncResult> {
  let client = options?.client || null;
  let shouldDisconnect = false;

  if (!client) {
    client = await createTelegramClient();
    shouldDisconnect = true;
  }

  if (!client) {
    return {
      modelId,
      channelId: telegramChannelId,
      success: false,
      transactionsCount: 0,
      totalStars: 0,
      error: "MTProto client not available (check TELEGRAM_SESSION_STRING).",
    };
  }

  try {
    const peer = await resolveChannelPeer(client, telegramChannelId);
    if (!peer) {
      throw new Error(`Could not resolve Telegram peer for channel: ${telegramChannelId}`);
    }

    let overallRevenue = 0;
    let availableBalance = 0;
    let currentBalance = 0;
    let withdrawalEnabled = false;
    let customUsdRate: number | undefined;

    // 1. Attempt to fetch channel revenue statistics (lifetime cumulative stars, USD rate, and withdrawable balance)
    try {
      const statsRes = (await client.invoke(
        new Api.payments.GetStarsRevenueStats({ peer })
      )) as any;

      if (statsRes?.usdRate != null) {
        customUsdRate = Number(statsRes.usdRate);
      }
      if (statsRes?.status) {
        const s = statsRes.status;
        if (s.overallRevenue != null) {
          overallRevenue = extractStarsValue(s.overallRevenue);
        }
        if (s.availableBalance != null) {
          // Genau "Belohnungen zur Abhebung verfügbar" direkt von Telegram
          availableBalance = extractStarsValue(s.availableBalance);
        }
        if (s.currentBalance != null) {
          currentBalance = extractStarsValue(s.currentBalance);
        }
        withdrawalEnabled = Boolean(s.withdrawalEnabled);
      }
    } catch (statsErr: any) {
      // GetStarsRevenueStats may fail if channel is below monetization threshold or user lacks admin rights
      console.log(`[Telegram Stars Engine] Note: GetStarsRevenueStats not available for ${telegramChannelId}: ${statsErr.message}`);
    }

    // 2. Full historical pagination loop via payments.GetStarsTransactions (inbound only to exclude withdrawals)
    let nextOffset = "";
    let page = 0;
    const MAX_PAGES = 50; // up to 5,000 transactions per channel
    let totalSyncedCount = 0;
    let sumTransactionStars = 0;

    while (page < MAX_PAGES) {
      let res: any;
      try {
        res = (await client.invoke(
          new Api.payments.GetStarsTransactions({
            peer,
            offset: nextOffset,
            limit: 100,
            inbound: true,
          })
        )) as any;
      } catch (invokeErr: any) {
        if (invokeErr.seconds) {
          console.warn(`[Telegram Stars Engine] FloodWait: Telegram asked to wait ${invokeErr.seconds}s`);
          await sleep(invokeErr.seconds * 1000);
          continue;
        }
        throw invokeErr;
      }

      // Check balance from StarsStatus if overallRevenue was not yet resolved
      if (!overallRevenue && res?.balance) {
        const bal = extractStarsValue(res.balance);
        if (bal > 0) overallRevenue = bal;
      }

      const history: any[] = res?.history || [];
      if (history.length === 0) {
        break;
      }

      for (const tx of history) {
        // Skip failed or refunded transactions
        if (tx.failed || tx.refund) continue;

        // Skip withdrawal / outgoing transactions so they do not add to incoming star revenue
        const isWithdrawal = isStarsNegative(tx.stars) || Boolean(tx.withdrawal);
        if (isWithdrawal) continue;

        const stars = extractStarsValue(tx.stars);
        if (stars <= 0) continue;

        const txId = String(tx.id);
        const txDate = tx.date ? new Date(tx.date * 1000) : new Date();
        const maturesAt = calculateMaturityDate(txDate);
        const status = new Date() >= maturesAt ? "MATURED" : "PENDING";
        const estimatedUsd = starsToUsd(stars, customUsdRate);

        await prisma.starTransaction.upsert({
          where: { telegramTxId: txId },
          update: {
            starsAmount: stars,
            estimatedUsd,
            status: new Date() >= maturesAt ? "MATURED" : undefined,
          },
          create: {
            modelId,
            telegramTxId: txId,
            starsAmount: stars,
            estimatedUsd,
            transactionDate: txDate,
            maturesAt,
            status,
          },
        });

        totalSyncedCount++;
        sumTransactionStars += stars;
      }

      // If no next page offset is returned or matches current offset, we reached the end of history
      if (!res.nextOffset || res.nextOffset === nextOffset) {
        break;
      }

      nextOffset = res.nextOffset;
      page++;
      // Brief pause between pagination requests to avoid flood
      await sleep(500);
    }

    // 3. Historical Reconciliation:
    // If Telegram reports an overall revenue higher than the individual transactions log
    // (e.g. older transactions pruned by Telegram or previous balance), preserve the difference as matured baseline!
    const baselineTxId = `baseline_historical_${modelId}`;
    if (overallRevenue > sumTransactionStars) {
      const baselineStars = overallRevenue - sumTransactionStars;
      const baselineUsd = starsToUsd(baselineStars, customUsdRate);

      await prisma.starTransaction.upsert({
        where: { telegramTxId: baselineTxId },
        update: {
          starsAmount: baselineStars,
          estimatedUsd: baselineUsd,
          status: "MATURED",
        },
        create: {
          modelId,
          telegramTxId: baselineTxId,
          starsAmount: baselineStars,
          estimatedUsd: baselineUsd,
          transactionDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // historical (> 21 days)
          maturesAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
          status: "MATURED",
        },
      });
      sumTransactionStars = overallRevenue;
      totalSyncedCount++;
    } else {
      // Remove obsolete baseline if all individual transactions now account for 100% of revenue
      await prisma.starTransaction.deleteMany({
        where: { telegramTxId: baselineTxId },
      });
    }

    // 4. Update Model record with Telegram's official live balance & revenue metrics
    try {
      await prisma.model.update({
        where: { id: modelId },
        data: {
          telegramAvailableStars: availableBalance,
          telegramCurrentBalance: currentBalance,
          telegramOverallRevenue: overallRevenue,
          telegramUsdRate: customUsdRate ?? 0.013,
          telegramWithdrawalEnabled: withdrawalEnabled,
        },
      });
    } catch (modelUpdateErr: any) {
      console.warn(`[Telegram Stars Engine] Could not update Model ${modelId} with telegram stats:`, modelUpdateErr.message);
    }

    console.log(
      `[Telegram Stars Engine] Synced channel ${telegramChannelId} (${modelId}): ${totalSyncedCount} transactions, ${sumTransactionStars} total stars, ${availableBalance} stars available for withdrawal ("Belohnungen zur Abhebung verfügbar").`
    );

    return {
      modelId,
      channelId: telegramChannelId,
      success: true,
      transactionsCount: totalSyncedCount,
      totalStars: sumTransactionStars,
      overallRevenue,
      availableBalance,
      currentBalance,
    };
  } catch (err: any) {
    console.error(`[Telegram Stars Engine] Error syncing channel ${telegramChannelId}:`, err.message);
    return {
      modelId,
      channelId: telegramChannelId,
      success: false,
      transactionsCount: 0,
      totalStars: 0,
      error: err.message,
    };
  } finally {
    if (shouldDisconnect && client) {
      try {
        await client.disconnect();
      } catch {}
    }
  }
}

/**
 * Synchronizes all registered models and channels against Telegram MTProto Stars.
 * Reconciles historical transactions across every channel.
 */
export async function syncAllModelsStars(providedClient?: TelegramClient): Promise<AllModelsSyncResult> {
  let client = providedClient || null;
  let shouldDisconnect = false;

  if (!client) {
    client = await createTelegramClient();
    shouldDisconnect = true;
  }

  if (!client) {
    return {
      success: false,
      syncedModels: 0,
      totalTransactions: 0,
      totalStars: 0,
      channels: [],
      error: "Telegram MTProto client could not be connected. Check TELEGRAM_SESSION_STRING.",
    };
  }

  try {
    // Prime entity cache once upfront
    try {
      await client.getDialogs({ limit: 100 });
    } catch (e: any) {
      console.warn("[Telegram Stars Engine] Dialog pre-caching warning:", e.message);
    }

    const models = await prisma.model.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, telegramChannelId: true },
    });

    console.log(`[Telegram Stars Engine] Starting sync for ${models.length} models...`);

    const results: ChannelSyncResult[] = [];
    let totalTransactions = 0;
    let totalStars = 0;

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      if (!model.telegramChannelId) continue;

      const res = await syncStarsForChannel(model.id, model.telegramChannelId, { client });
      results.push(res);
      totalTransactions += res.transactionsCount;
      totalStars += res.totalStars;

      // Rate limit protection: small pause between channels
      if (i < models.length - 1) {
        await sleep(1500);
      }
    }

    return {
      success: true,
      syncedModels: results.filter((r) => r.success).length,
      totalTransactions,
      totalStars,
      channels: results,
    };
  } catch (err: any) {
    console.error("[Telegram Stars Engine] Fatal error in syncAllModelsStars:", err);
    return {
      success: false,
      syncedModels: 0,
      totalTransactions: 0,
      totalStars: 0,
      channels: [],
      error: err.message,
    };
  } finally {
    if (shouldDisconnect && client) {
      try {
        await client.disconnect();
      } catch {}
    }
  }
}
