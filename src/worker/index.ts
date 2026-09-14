import { Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { PrismaClient } from "@prisma/client";
import { publishToTelegram } from "../lib/telegram-bot";
import { calculateMaturityDate, starsToUsd } from "../lib/financial-engine";
import { syncAllModelsStars } from "../lib/telegram-stars";

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
  console.log(`[Userbot DataSync] [${new Date().toISOString()}] Starting Telegram Stars Historical Sync...`);
  console.log(`===============================================================\n`);

  try {
    const client = await getMTProtoClient();
    const result = await syncAllModelsStars(client || undefined);
    console.log(
      `[Userbot DataSync] Sync cycle completed: ${result.syncedModels} models, ${result.totalTransactions} transactions, ${result.totalStars} total stars.`
    );
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

          if (post.asset?.fileUrl) {
            const { deleteAssetLocalFile } = await import("../lib/assets");
            await deleteAssetLocalFile(post.asset.fileUrl);
          }
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
 * BullMQ Worker: Processes on-demand "stars-sync" queue jobs triggered by Master Admin.
 */
function startStarsSyncWorker(): Worker | null {
  const syncWorker = new Worker(
    "stars-sync",
    async (job: Job) => {
      console.log(`[Worker] Manually triggered stars-sync job ${job.id} received.`);
      const client = await getMTProtoClient();
      const result = await syncAllModelsStars(client || undefined);
      console.log(
        `[Worker] Stars sync completed: ${result.syncedModels} models, ${result.totalTransactions} transactions, ${result.totalStars} stars.`
      );
    },
    {
      connection: redisConnection,
      concurrency: 1,
    }
  );

  return syncWorker;
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
  startStarsSyncWorker();

  // Start Cron Schedulers
  startCronSchedulers();
  console.log("[Worker] 30-minute MTProto Sync loop initialized.");

  // Wait for database schema to be ready (up to 30 attempts, 2s intervals)
  console.log("[Worker] Verifying database connectivity...");
  let dbReady = false;
  for (let i = 1; i <= 30; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      await checkMaturedTransactions();
      dbReady = true;
      console.log("[Worker] Database is ready and synchronized.");
      break;
    } catch (e: any) {
      console.log(`[Worker] Database initializing... waiting (attempt ${i}/30)...`);
      await sleep(2000);
    }
  }

  if (dbReady) {
    try {
      await syncStarsTransactions();
    } catch (err) {
      console.error("[Worker] Initial stars sync warning:", err);
    }
  } else {
    console.warn("[Worker] Database was not ready after 60s. Worker will continue running background cron.");
  }
}

main().catch((err) => {
  console.error("[Worker] Error in worker main:", err);
  // Keep process alive so Docker/Coolify does not enter crash loop
});
