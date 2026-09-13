import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { PrismaClient } from "@prisma/client";
import { publishToTelegram } from "../lib/telegram-bot";
import { calculateMaturityDate, starsToUsd } from "../lib/financial-engine";

const prisma = new PrismaClient();
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Flag to keep auto-posting disabled per user requirement:
// "der userbot soll noch nicht automatisiert posten das möchte ich erstmal manuell machen"
const ENABLE_AUTOMATED_POSTING = process.env.ENABLE_AUTOMATED_POSTING === "true";

// Stagger delay between channel requests to protect against Telegram rate limits (FloodWait)
const CHANNEL_STAGGER_DELAY_MS = 30 * 1000; // 30 seconds offset between each channel
const SYNC_INTERVAL_MS = 30 * 60 * 1000;    // Exactly every 30 minutes

// Helper sleep function
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// MTProto Client configuration
const apiId = Number(process.env.TELEGRAM_API_ID || "0");
const apiHash = process.env.TELEGRAM_API_HASH || "";
const sessionString = process.env.TELEGRAM_SESSION_STRING || "";

let mtprotoClient: TelegramClient | null = null;
let isSyncInProgress = false;

async function getMTProtoClient(): Promise<TelegramClient | null> {
  if (mtprotoClient) return mtprotoClient;
  if (!apiId || !apiHash || !sessionString) {
    console.warn("[Userbot DataSync] GramJS MTProto credentials not provided. Running in simulation mode.");
    return null;
  }

  try {
    const stringSession = new StringSession(sessionString);
    const client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 5,
    });
    await client.connect();
    console.log("[Userbot DataSync] GramJS MTProto Client successfully connected for data collection.");
    mtprotoClient = client;
    return client;
  } catch (err) {
    console.error("[Userbot DataSync] Failed to connect MTProto Client:", err);
    return null;
  }
}

/**
 * Sync native Telegram Stars transactions for all channels via MTProto.
 * Rate limit protection:
 * - Runs every 30 minutes.
 * - Staggers each channel request with a 30-second delay.
 * - Captures FloodWait errors gracefully.
 */
export async function syncStarsTransactions(): Promise<void> {
  if (isSyncInProgress) {
    console.log("[Userbot DataSync] Sync cycle already running. Skipping duplicate trigger.");
    return;
  }

  isSyncInProgress = true;
  console.log(`\n===============================================================`);
  console.log(`[Userbot DataSync] [${new Date().toISOString()}] Starting 30-minute sync cycle...`);
  console.log(`[Userbot DataSync] Rate-limit protection: 30s delay between channel requests.`);
  console.log(`===============================================================\n`);

  try {
    const models = await prisma.model.findMany({
      orderBy: { createdAt: "asc" },
    });

    const client = await getMTProtoClient();

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      console.log(`[Userbot DataSync] (${i + 1}/${models.length}) Querying statistics for channel: ${model.name} (${model.telegramChannelId})...`);

      if (client) {
        try {
          const peer = await client.getInputEntity(model.telegramChannelId);
          const result = (await client.invoke(
            new Api.payments.GetStarsTransactions({
              peer,
              offset: "",
              limit: 100,
            })
          )) as any;

          const transactions = result?.history || [];
          console.log(`[Userbot DataSync] Found ${transactions.length} stars transactions for ${model.name}`);

          for (const tx of transactions) {
            const txId = String(tx.id);
            const stars = Math.abs(Number(tx.stars || tx.starsAmount || 0));
            const txDate = new Date(tx.date * 1000);
            const maturesAt = calculateMaturityDate(txDate);
            const status = new Date() >= maturesAt ? "MATURED" : "PENDING";
            const estimatedUsd = starsToUsd(stars);

            await prisma.starTransaction.upsert({
              where: { telegramTxId: txId },
              update: {
                status: new Date() >= maturesAt ? "MATURED" : undefined,
              },
              create: {
                modelId: model.id,
                telegramTxId: txId,
                starsAmount: stars,
                estimatedUsd,
                transactionDate: txDate,
                maturesAt,
                status,
              },
            });
          }
        } catch (callErr: any) {
          console.error(`[Userbot DataSync] Error fetching stars for ${model.name}:`, callErr.message);
          // Check for Telegram FloodWait
          if (callErr.seconds) {
            console.warn(`[Userbot DataSync] FloodWait received: Telegram requested to wait ${callErr.seconds}s`);
            await sleep(callErr.seconds * 1000);
          }
        }
      } else {
        console.log(`[Userbot DataSync] Simulation mode: Statistics recorded for ${model.name}`);
      }

      // If there are more channels to query, apply the 30-second rate-limit protection offset
      if (i < models.length - 1) {
        console.log(`[Userbot DataSync] Waiting 30s before querying next channel to protect rate limits...`);
        await sleep(CHANNEL_STAGGER_DELAY_MS);
      }
    }

    console.log(`\n[Userbot DataSync] 30-minute sync cycle completed successfully.\n`);
  } catch (err: any) {
    console.error("[Userbot DataSync] Fatal error in sync loop:", err);
  } finally {
    isSyncInProgress = false;
  }
}

/**
 * Check and mature all transactions where now() >= maturesAt (21 days)
 */
export async function checkMaturedTransactions(): Promise<number> {
  const now = new Date();
  const result = await prisma.starTransaction.updateMany({
    where: {
      status: "PENDING",
      maturesAt: {
        lte: now,
      },
    },
    data: {
      status: "MATURED",
    },
  });

  if (result.count > 0) {
    console.log(`[Worker] Matured ${result.count} transactions to MATURED status.`);
  }
  return result.count;
}

/**
 * BullMQ Worker: Configured strictly for MANUAL trigger requests.
 * Automated scheduling is paused as requested.
 */
function startManualPostingWorker(): Worker | null {
  if (!ENABLE_AUTOMATED_POSTING) {
    console.log("[Worker] Automated posting is PAUSED. Postings are triggered manually by the user.");
  }

  const postWorker = new Worker(
    "telegram-posts",
    async (job: Job) => {
      // Even if jobs exist, only process if explicitly triggered or enabled
      const { postId, isManual } = job.data;
      if (!ENABLE_AUTOMATED_POSTING && !isManual) {
        console.log(`[Worker] Automated job ${job.id} skipped (auto-posting disabled). Post ${postId} will wait for manual trigger.`);
        return;
      }

      console.log(`[Worker] Manually processing post job ${job.id} for post: ${postId}`);

      const post = await prisma.post.findUnique({
        where: { id: postId },
        include: { model: true, asset: true },
      });

      if (!post || post.status === "PUBLISHED") {
        return;
      }

      const result = await publishToTelegram({
        channelId: post.model.telegramChannelId,
        fileUrl: post.asset?.fileUrl,
        type: post.asset?.type,
        caption: post.caption,
        starsPrice: post.starsPrice,
      });

      if (result.success) {
        await prisma.post.update({
          where: { id: post.id },
          data: {
            status: "PUBLISHED",
            telegramMsgId: result.messageId,
          },
        });
        if (post.assetId) {
          await prisma.asset.update({
            where: { id: post.assetId },
            data: { isUsed: true },
          });
        }
        console.log(`[Worker] Successfully published post ${post.id}, msgId: ${result.messageId}`);
      } else {
        await prisma.post.update({
          where: { id: post.id },
          data: { status: "FAILED" },
        });
        throw new Error(result.error || "Failed to publish post to Telegram");
      }
    },
    {
      connection: redisConnection,
      concurrency: 2,
    }
  );

  return postWorker;
}

/**
 * Recurring cron intervals:
 * - Sync Stars every 30 minutes with 30s channel offset.
 * - Check 21-day maturity hourly.
 */
function startCronSchedulers(): void {
  // 1. Sync stars every 30 minutes
  setInterval(async () => {
    try {
      await syncStarsTransactions();
    } catch (e) {
      console.error("[Userbot DataSync] 30m sync error:", e);
    }
  }, SYNC_INTERVAL_MS);

  // 2. Check matured transactions every hour
  const ONE_HOUR = 60 * 60 * 1000;
  setInterval(async () => {
    try {
      await checkMaturedTransactions();
    } catch (e) {
      console.error("[Worker] Maturity check error:", e);
    }
  }, ONE_HOUR);
}

async function main() {
  console.log("===============================================================");
  console.log("   AutoActs Userbot Data Collection & Statistics Service       ");
  console.log("===============================================================");
  console.log("• Role: Pure Data Collection (Channel revenue & stars sync)");
  console.log("• Automated Posting: DISABLED (Manual posting active)");
  console.log("• Cycle: Every 30 minutes with 30 seconds delay per channel");
  console.log("===============================================================");

  // Initialize Worker for manual triggers
  startManualPostingWorker();

  // Start Cron Schedulers
  startCronSchedulers();
  console.log("[Worker] 30-minute MTProto Sync loop initialized.");

  // Run initial checks on startup
  await checkMaturedTransactions();
  await syncStarsTransactions();
}

main().catch((err) => {
  console.error("[Worker] Fatal error running worker:", err);
  process.exit(1);
});
