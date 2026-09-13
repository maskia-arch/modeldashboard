import { Queue } from "bullmq";
import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const redisConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
});

// Queue for publishing scheduled posts
export const postQueue = new Queue("telegram-posts", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

// Queue for triggering MTProto star transactions sync
export const syncQueue = new Queue("stars-sync", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: 100,
  },
});
