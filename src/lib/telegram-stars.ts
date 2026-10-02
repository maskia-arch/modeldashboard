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

export interface UserbotAccountConfig {
  index: number;
  label: string;
  apiId: number;
  apiHash: string;
  sessionString: string;
}

/**
 * Returns all configured userbot accounts from environment variables.
 * Account 1: TELEGRAM_SESSION_STRING (or TELEGRAM_SESSION_STRING_1)
 * Account 2: TELEGRAM_SESSION_STRING_2 (Security userbot)
 */
export function getUserbotConfigs(): UserbotAccountConfig[] {
  const configs: UserbotAccountConfig[] = [];

  // Account 1 (Primary / redo)
  const session1 = process.env.TELEGRAM_SESSION_STRING || process.env.TELEGRAM_SESSION_STRING_1;
  const apiId1 = Number(process.env.TELEGRAM_API_ID || process.env.TELEGRAM_API_ID_1 || "2040");
  const apiHash1 = process.env.TELEGRAM_API_HASH || process.env.TELEGRAM_API_HASH_1 || "b18441a1ff607e10a989891a5462e627";

  if (session1 && session1.length > 20 && apiId1 && apiHash1) {
    configs.push({
      index: 1,
      label: "Userbot 1 (redo666redo)",
      apiId: apiId1,
      apiHash: apiHash1,
      sessionString: session1,
    });
  }

  // Account 2 (Security account / Quarantänebetrieb)
  const session2 = process.env.TELEGRAM_SESSION_STRING_2;
  const apiId2 = Number(process.env.TELEGRAM_API_ID_2 || process.env.TELEGRAM_API_ID || "2040");
  const apiHash2 = process.env.TELEGRAM_API_HASH_2 || process.env.TELEGRAM_API_HASH || "b18441a1ff607e10a989891a5462e627";

  if (session2 && session2.length > 20 && apiId2 && apiHash2) {
    configs.push({
      index: 2,
      label: "Userbot 2 (de_404)",
      apiId: apiId2,
      apiHash: apiHash2,
      sessionString: session2,
    });
  }

  return configs;
}

/**
 * Creates and connects a GramJS MTProto TelegramClient for a specific account index (default = 1).
 */
export async function createTelegramClient(accountIndex: number = 1): Promise<TelegramClient | null> {
  const configs = getUserbotConfigs();
  const config = configs.find((c) => c.index === accountIndex) || (accountIndex === 1 ? configs[0] : null);

  if (!config) {
    console.warn(`[Telegram Stars Engine] MTProto credentials missing for Userbot ${accountIndex}.`);
    return null;
  }

  try {
    const session = new StringSession(config.sessionString);
    const client = new TelegramClient(session, config.apiId, config.apiHash, {
      connectionRetries: 5,
    });
    await client.connect();
    return client;
  } catch (err: any) {
    console.error(`[Telegram Stars Engine] Failed to connect MTProto client (Userbot ${accountIndex}):`, err.message);
    return null;
  }
}

/**
 * Returns connected clients for all configured userbot accounts.
 */
export async function getAllTelegramClients(): Promise<Array<{ index: number; label: string; client: TelegramClient }>> {
  const configs = getUserbotConfigs();
  const results: Array<{ index: number; label: string; client: TelegramClient }> = [];

  for (const c of configs) {
    try {
      const session = new StringSession(c.sessionString);
      const client = new TelegramClient(session, c.apiId, c.apiHash, { connectionRetries: 3 });
      await client.connect();
      results.push({ index: c.index, label: c.label, client });
    } catch (e: any) {
      console.error(`[Telegram Stars Engine] Failed to connect ${c.label}:`, e.message);
    }
  }

  return results;
}

export interface ChannelPeerResolution {
  client: TelegramClient;
  peer: any;
  accountIndex: number;
  userbotLabel: string;
  isCreator: boolean;
  isAdmin: boolean;
  canPost: boolean;
  score: number;
  alternativeClients?: ChannelPeerResolution[];
}

/**
 * Intelligent Channel Routing:
 * Automatically inspects ALL connected userbots (Account 1 and Account 2).
 * Priority Ranking:
 * 1. INHABER / CREATOR of the channel (e.g. Userbot 2 "de_404" for Quarantänebetrieb like Hanni)
 * 2. Administrator with post privileges (postMessages: true)
 * 3. General administrator or member (for read operations)
 * When requireWriteRights is true (e.g. for publishing), non-admin subscribers (who cannot post)
 * are filtered out so Telegram permission errors never occur!
 */
export async function resolveClientAndPeerForChannel(
  channelId: string,
  options?: {
    clients?: Array<{ index: number; label: string; client: TelegramClient }>;
    requireWriteRights?: boolean;
    preferredAccountIndex?: number;
  }
): Promise<ChannelPeerResolution | null> {
  const cleanId = String(channelId).trim();
  const allClients = options?.clients || (await getAllTelegramClients());

  if (allClients.length === 0) {
    console.warn("[Telegram Routing] Keine aktiven Telegram Userbots konfiguriert.");
    return null;
  }

  const candidates: ChannelPeerResolution[] = [];

  for (const item of allClients) {
    try {
      const peer = await resolveChannelPeer(item.client, cleanId);
      if (!peer) continue;

      let isCreator = false;
      let isAdmin = false;
      let canPost = false;

      try {
        const entity = (await item.client.getEntity(peer)) as any;
        if (entity) {
          isCreator = Boolean(entity.creator);
          isAdmin = Boolean(entity.creator || entity.adminRights);

          if (entity.broadcast) {
            // Broadcast channels require creator or admin with postMessages right
            canPost = Boolean(entity.creator || (entity.adminRights && entity.adminRights.postMessages !== false));
          } else {
            // Megagroups / groups permit members to post unless banned
            const banned = entity.defaultBannedRights;
            canPost = Boolean(entity.creator || entity.adminRights || !banned?.sendMessages);
          }
        }
      } catch (entErr: any) {
        console.warn(`[Telegram Routing] Entity inspection notice for ${item.label} on ${cleanId}:`, entErr.message);
      }

      let score = 0;
      if (isCreator) score += 100; // INHABER des Kanals (Höchste Priorität!)
      if (canPost) score += 50;   // Besitzt Schreib-/Senderechte
      if (isAdmin) score += 20;   // Administrator-Status
      if (options?.preferredAccountIndex && item.index === options.preferredAccountIndex) {
        score += 30;              // Bevorzugtes Konto
      }

      candidates.push({
        client: item.client,
        peer,
        accountIndex: item.index,
        userbotLabel: item.label,
        isCreator,
        isAdmin,
        canPost,
        score,
      });
    } catch {
      // Channel not accessible by this bot, try next
    }
  }

  if (candidates.length === 0) {
    console.warn(`[Telegram Routing] Kanal "${cleanId}" konnte von keinem Userbot aufgelöst werden.`);
    return null;
  }

  // Sort candidates by score descending (Creator first, then Admin with post rights)
  candidates.sort((a, b) => b.score - a.score);

  // If write rights are required (e.g. publishing posts), prioritize bots that can post
  if (options?.requireWriteRights !== false) {
    const candidatesWithWrite = candidates.filter((c) => c.canPost);
    if (candidatesWithWrite.length > 0) {
      const best = candidatesWithWrite[0];
      best.alternativeClients = candidatesWithWrite.slice(1);
      console.log(
        `[Telegram Routing] Kanal "${cleanId}" zugeordnet zu: ${best.userbotLabel} (Inhaber: ${best.isCreator ? "Ja" : "Nein"}, Schreibrechte: ${best.canPost ? "Ja" : "Nein"}, Score: ${best.score})`
      );
      return best;
    }

    console.warn(
      `[Telegram Routing] Kein Userbot besitzt Schreibrechte im Kanal "${cleanId}". Gefundene Bots: ${candidates.map(c => `${c.userbotLabel} (Inhaber: ${c.isCreator})`).join(", ")}`
    );
  }

  const best = candidates[0];
  best.alternativeClients = candidates.slice(1);
  return best;
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
  options?: { client?: TelegramClient; allClients?: Array<{ index: number; label: string; client: TelegramClient }> }
): Promise<ChannelSyncResult> {
  let client = options?.client || null;
  let peer: any = null;
  let shouldDisconnect = !options?.client && !options?.allClients;

  if (client) {
    try {
      peer = await resolveChannelPeer(client, telegramChannelId);
    } catch {}
  } else {
    const resolved = await resolveClientAndPeerForChannel(telegramChannelId, { clients: options?.allClients });
    if (resolved) {
      client = resolved.client;
      peer = resolved.peer;
    }
  }

  if (!client || !peer) {
    return {
      modelId,
      channelId: telegramChannelId,
      success: false,
      transactionsCount: 0,
      totalStars: 0,
      error: `Kanal "${telegramChannelId}" konnte keinem aktiven Userbot zugeordnet werden. Bitte Berechtigungen in Telegram prüfen.`,
    };
  }

  try {

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
      const baselineStatus: "PENDING" | "MATURED" = (availableBalance > 0 && availableBalance >= baselineStars) ? "MATURED" : "PENDING";

      await prisma.starTransaction.upsert({
        where: { telegramTxId: baselineTxId },
        update: {
          starsAmount: baselineStars,
          estimatedUsd: baselineUsd,
          status: baselineStatus,
        },
        create: {
          modelId,
          telegramTxId: baselineTxId,
          starsAmount: baselineStars,
          estimatedUsd: baselineUsd,
          transactionDate: baselineStatus === "MATURED" ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : new Date(),
          maturesAt: baselineStatus === "MATURED" ? new Date(Date.now() - 9 * 24 * 60 * 60 * 1000) : new Date(Date.now() + 21 * 24 * 60 * 60 * 1000),
          status: baselineStatus,
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
  let allClients: Array<{ index: number; label: string; client: TelegramClient }> = [];
  let shouldDisconnect = false;

  if (providedClient) {
    allClients = [{ index: 1, label: "Userbot 1", client: providedClient }];
  } else {
    allClients = await getAllTelegramClients();
    shouldDisconnect = true;
  }

  if (allClients.length === 0) {
    return {
      success: false,
      syncedModels: 0,
      totalTransactions: 0,
      totalStars: 0,
      channels: [],
      error: "Kein Telegram MTProto Userbot konnte verbunden werden. Bitte TELEGRAM_SESSION_STRING / TELEGRAM_SESSION_STRING_2 prüfen.",
    };
  }

  try {
    // Prime entity cache for all connected clients
    for (const c of allClients) {
      try {
        await c.client.getDialogs({ limit: 100 });
      } catch (e: any) {
        console.warn(`[Telegram Stars Engine] Dialog pre-caching warning for ${c.label}:`, e.message);
      }
    }

    const models = await prisma.model.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, telegramChannelId: true },
    });

    console.log(`[Telegram Stars Engine] Starting sync for ${models.length} models across ${allClients.length} userbots...`);

    const results: ChannelSyncResult[] = [];
    let totalTransactions = 0;
    let totalStars = 0;

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      if (!model.telegramChannelId) continue;

      const res = await syncStarsForChannel(model.id, model.telegramChannelId, { allClients });
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
    if (shouldDisconnect) {
      for (const c of allClients) {
        try {
          await c.client.disconnect();
        } catch {}
      }
    }
  }
}
