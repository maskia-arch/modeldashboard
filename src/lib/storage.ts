import fs from "fs";
import path from "path";
import crypto from "crypto";
import { prisma } from "./prisma";
import { deleteAssetLocalFile, getAssetLocalPath } from "./assets";

// 50 GB Quota for content storage
export const CONTENT_STORAGE_QUOTA_BYTES = 50 * 1024 * 1024 * 1024; // 53,687,091,200 Bytes

export interface StorageStatus {
  quotaBytes: number;
  quotaGb: number;
  usedBytes: number;
  usedMb: number;
  usedGb: number;
  freeBytes: number;
  freeGb: number;
  usedPercentage: number;
  totalFiles: number;
  photoCount: number;
  videoCount: number;
  activeAssetsCount: number;
  usedAssetsCount: number;
  isNearQuota: boolean; // > 80%
  isOverQuota: boolean; // >= 100%
}

/**
 * Calculates SHA-256 hash of a buffer for exact content deduplication.
 */
export function calculateBufferHash(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/**
 * Recursively scans directories to compute exact byte sizes and count files.
 */
function getDirectoryDiskUsage(dirPath: string, visitedInodes = new Set<number>()): { bytes: number; files: number } {
  let bytes = 0;
  let files = 0;

  if (!fs.existsSync(dirPath)) {
    return { bytes, files };
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (entry.isDirectory()) {
          const sub = getDirectoryDiskUsage(fullPath, visitedInodes);
          bytes += sub.bytes;
          files += sub.files;
        } else if (entry.isFile()) {
          if (!visitedInodes.has(stat.ino)) {
            visitedInodes.add(stat.ino);
            bytes += stat.size;
            files += 1;
          }
        }
      } catch {}
    }
  } catch {}

  return { bytes, files };
}

/**
 * Returns comprehensive real-time storage metrics for the 50 GB Content Pool.
 */
export async function getContentStorageStatus(): Promise<StorageStatus> {
  const visitedInodes = new Set<number>();

  // Check both public/uploads and root uploads
  const dir1 = path.join(process.cwd(), "public", "uploads");
  const dir2 = path.join(process.cwd(), "uploads");

  const usage1 = getDirectoryDiskUsage(dir1, visitedInodes);
  const usage2 = getDirectoryDiskUsage(dir2, visitedInodes);

  const usedBytes = usage1.bytes + usage2.bytes;
  const totalFiles = usage1.files + usage2.files;

  const quotaBytes = CONTENT_STORAGE_QUOTA_BYTES;
  const freeBytes = Math.max(0, quotaBytes - usedBytes);

  const usedMb = Math.round((usedBytes / (1024 * 1024)) * 100) / 100;
  const usedGb = Math.round((usedBytes / (1024 * 1024 * 1024)) * 100) / 100;
  const freeGb = Math.round((freeBytes / (1024 * 1024 * 1024)) * 100) / 100;
  const quotaGb = 50.0;
  const usedPercentage = Math.round((usedBytes / quotaBytes) * 10000) / 100;

  let activeAssetsCount = 0;
  let usedAssetsCount = 0;
  let photoCount = 0;
  let videoCount = 0;

  try {
    activeAssetsCount = await prisma.asset.count({ where: { isUsed: false } });
    usedAssetsCount = await prisma.asset.count({ where: { isUsed: true } });
    photoCount = await prisma.asset.count({ where: { type: "PHOTO", isUsed: false } });
    videoCount = await prisma.asset.count({ where: { type: "VIDEO", isUsed: false } });
  } catch {}

  return {
    quotaBytes,
    quotaGb,
    usedBytes,
    usedMb,
    usedGb,
    freeBytes,
    freeGb,
    usedPercentage,
    totalFiles,
    photoCount,
    videoCount,
    activeAssetsCount,
    usedAssetsCount,
    isNearQuota: usedPercentage >= 80,
    isOverQuota: usedPercentage >= 100,
  };
}

/**
 * Checks whether an identical asset already exists for a model based on content hash.
 */
export async function findDuplicateAsset(modelId: string, hash: string) {
  const match = await prisma.asset.findFirst({
    where: {
      modelId,
      OR: [
        { tags: { has: `hash_${hash}` } },
        { notes: { contains: `[HASH:${hash}]` } },
      ],
    },
    select: { id: true, fileUrl: true },
  });

  return match;
}

/**
 * Deletes all physical media files from disk for already posted / used content
 * and purges duplicate media files across the model's inventory.
 */
export async function cleanupStorageAndDuplicates(modelId?: string): Promise<{
  usedCleanedCount: number;
  duplicatesRemovedCount: number;
  freedBytes: number;
  freedMb: number;
  storage: StorageStatus;
}> {
  let freedBytes = 0;
  let usedCleanedCount = 0;
  let duplicatesRemovedCount = 0;

  // 1. Clean up "Verbrauchter Content":
  const usedAssets = await prisma.asset.findMany({
    where: {
      isUsed: true,
      ...(modelId ? { modelId } : {}),
    },
  });

  for (const asset of usedAssets) {
    if (asset.fileUrl) {
      const localPath = getAssetLocalPath(asset.fileUrl);
      if (localPath && fs.existsSync(localPath)) {
        try {
          const stat = fs.statSync(localPath);
          freedBytes += stat.size;
        } catch {}
      }

      const deleted = await deleteAssetLocalFile(asset.fileUrl);
      if (deleted) {
        usedCleanedCount++;
      }
    }

    // Clean out heavy base64 backups from notes for used assets to free database storage
    if (asset.notes && asset.notes.includes("[BACKUP_DATA:")) {
      const cleanedNotes = asset.notes.replace(/\|\s*\[BACKUP_DATA:[^\]]+\]/g, "").trim();
      await prisma.asset.update({
        where: { id: asset.id },
        data: { notes: cleanedNotes },
      });
    }
  }

  // Also check published posts where asset is not yet marked isUsed
  const publishedPosts = await prisma.post.findMany({
    where: {
      status: "PUBLISHED",
      assetId: { not: null },
      ...(modelId ? { modelId } : {}),
    },
    include: { asset: true },
  });

  for (const post of publishedPosts) {
    if (post.asset) {
      if (!post.asset.isUsed) {
        await prisma.asset.update({
          where: { id: post.asset.id },
          data: { isUsed: true },
        });
      }

      if (post.asset.fileUrl) {
        const localPath = getAssetLocalPath(post.asset.fileUrl);
        if (localPath && fs.existsSync(localPath)) {
          try {
            const stat = fs.statSync(localPath);
            freedBytes += stat.size;
          } catch {}
        }
        const deleted = await deleteAssetLocalFile(post.asset.fileUrl);
        if (deleted) {
          usedCleanedCount++;
        }
      }
    }
  }

  // 2. Detect & delete duplicate files in active inventory:
  const activeAssets = await prisma.asset.findMany({
    where: {
      isUsed: false,
      ...(modelId ? { modelId } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  const seenHashes = new Map<string, string>();

  for (const asset of activeAssets) {
    let hash: string | null = null;

    const hashMatch = asset.notes?.match(/\[HASH:([a-f0-9]{64})\]/i);
    if (hashMatch) {
      hash = hashMatch[1];
    } else if (asset.fileUrl) {
      const localPath = getAssetLocalPath(asset.fileUrl);
      if (localPath && fs.existsSync(localPath)) {
        try {
          const buffer = fs.readFileSync(localPath);
          hash = calculateBufferHash(buffer);
          await prisma.asset.update({
            where: { id: asset.id },
            data: { notes: `${asset.notes || ""} | [HASH:${hash}]`.trim() },
          });
        } catch {}
      }
    }

    if (hash) {
      if (seenHashes.has(hash)) {
        console.log(`[Deduplication] Found duplicate asset ${asset.id} (matches primary ${seenHashes.get(hash)})`);

        const linkedPost = await prisma.post.findFirst({ where: { assetId: asset.id } });
        if (linkedPost) {
          const primaryId = seenHashes.get(hash)!;
          await prisma.post.update({
            where: { id: linkedPost.id },
            data: { assetId: primaryId },
          });
        }

        if (asset.fileUrl) {
          const localPath = getAssetLocalPath(asset.fileUrl);
          if (localPath && fs.existsSync(localPath)) {
            try {
              const stat = fs.statSync(localPath);
              freedBytes += stat.size;
            } catch {}
          }
          await deleteAssetLocalFile(asset.fileUrl);
        }

        await prisma.asset.delete({ where: { id: asset.id } });
        duplicatesRemovedCount++;
      } else {
        seenHashes.set(hash, asset.id);
      }
    }
  }

  const updatedStorage = await getContentStorageStatus();
  const freedMb = Math.round((freedBytes / (1024 * 1024)) * 100) / 100;

  return {
    usedCleanedCount,
    duplicatesRemovedCount,
    freedBytes,
    freedMb,
    storage: updatedStorage,
  };
}
