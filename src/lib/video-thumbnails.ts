import fs from "fs";
import path from "path";
import { getAssetLocalPath } from "./assets";
import { prisma } from "./prisma";

/**
 * Returns the expected local path of a video's thumbnail image (.jpg).
 * e.g. /path/to/video.mp4 -> /path/to/video.jpg
 */
export function getExpectedVideoThumbnailPath(videoFilePath: string): string {
  return videoFilePath.replace(/\.(mp4|mov|mkv|avi|webm)$/i, ".jpg");
}

/**
 * Checks if a video thumbnail already exists on disk.
 */
export function findExistingVideoThumbnail(videoFilePath: string): string | null {
  const candidates = [
    videoFilePath.replace(/\.(mp4|mov|mkv|avi|webm)$/i, ".jpg"),
    videoFilePath.replace(/\.(mp4|mov|mkv|avi|webm)$/i, ".png"),
    videoFilePath.replace(/\.(mp4|mov|mkv|avi|webm)$/i, ".webp"),
    videoFilePath.replace(/\.[^/.]+$/, "_thumb.jpg"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const stat = fs.statSync(candidate);
        if (stat.size > 100) return candidate;
      } catch {}
    }
  }

  return null;
}

/**
 * Creates a minimal valid fallback JPEG image buffer if no thumbnail is available.
 */
export function createFallbackThumbnailBuffer(): Buffer {
  const defaultJpegBase64 =
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
  return Buffer.from(defaultJpegBase64, "base64");
}

/**
 * Resolves or downloads the thumbnail for an asset:
 * 1. Checks if a thumbnail already exists on disk alongside the video.
 * 2. If missing, attempts to download the thumbnail from Telegram via GramJS (if it originated from a source channel).
 * 3. If still missing, writes a minimal fallback thumbnail so Grok Vision can proceed without throwing filesystem errors.
 */
export async function getOrCreateVideoThumbnail(asset: {
  id: string;
  fileUrl?: string | null;
  notes?: string | null;
  tags?: string[];
  modelId?: string;
  model?: { slug?: string; id?: string };
}): Promise<{ thumbnailPath: string; isFallback: boolean }> {
  const localVideoPath = getAssetLocalPath(asset.fileUrl);

  if (localVideoPath) {
    const existing = findExistingVideoThumbnail(localVideoPath);
    if (existing) {
      return { thumbnailPath: existing, isFallback: false };
    }
  }

  // 2. Try downloading thumbnail from Telegram if Telegram session and source message are available
  try {
    const targetThumbPath = localVideoPath
      ? getExpectedVideoThumbnailPath(localVideoPath)
      : path.join(process.cwd(), "public", "uploads", "models", asset.model?.slug || "general", `thumb_${asset.id}.jpg`);

    // Ensure parent directory exists
    const dir = path.dirname(targetThumbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Extract Telegram message ID from tags or notes
    let msgId: number | null = null;
    const msgTag = (asset.tags || []).find((t) => t.startsWith("msg_"));
    if (msgTag) {
      msgId = parseInt(msgTag.replace("msg_", ""), 10);
    } else if (asset.notes) {
      const match = asset.notes.match(/Nachricht #(\d+)/i);
      if (match && match[1]) {
        msgId = parseInt(match[1], 10);
      }
    }

    if (msgId && (asset.modelId || asset.model?.id)) {
      const mId = asset.modelId || asset.model!.id!;
      const { getModelSource } = await import("./model-sources");
      const sourceConfig = getModelSource(mId);

      if (sourceConfig?.sourceChannelId) {
        const { createTelegramClient, resolveChannelPeer } = await import("./telegram-stars");
        const client = await createTelegramClient();

        if (client) {
          try {
            const peer = await resolveChannelPeer(client, sourceConfig.sourceChannelId);
            if (peer) {
              const messages = await client.getMessages(peer, { ids: [msgId] });
              const msg = messages && messages.length > 0 ? messages[0] : null;

              if (msg && msg.media) {
                console.log(`[VideoThumbnail] Downloading thumbnail from Telegram msg #${msgId} for asset ${asset.id}...`);
                await client.downloadMedia(msg, {
                  outputFile: targetThumbPath,
                  thumb: -1, // Highest resolution available thumbnail
                });

                if (fs.existsSync(targetThumbPath)) {
                  const stat = await fs.promises.stat(targetThumbPath);
                  if (stat.size > 200) {
                    console.log(`[VideoThumbnail] Successfully retrieved Telegram thumbnail (${stat.size} bytes) -> ${targetThumbPath}`);
                    return { thumbnailPath: targetThumbPath, isFallback: false };
                  }
                }
              }
            }
          } catch (tErr: any) {
            console.warn(`[VideoThumbnail] Telegram thumbnail download failed for msg #${msgId}:`, tErr.message);
          } finally {
            try {
              await client.disconnect();
            } catch {}
          }
        }
      }
    }

    // 3. Fallback: Write minimal valid JPEG image so Grok Vision doesn't fail on disk read
    const fallbackBuf = createFallbackThumbnailBuffer();
    await fs.promises.writeFile(targetThumbPath, fallbackBuf);
    return { thumbnailPath: targetThumbPath, isFallback: true };
  } catch (err: any) {
    console.warn(`[VideoThumbnail] Error in getOrCreateVideoThumbnail for asset ${asset.id}:`, err.message);
  }

  // Last resort: create a temp file
  const tmpPath = path.join(process.cwd(), "public", "uploads", `fallback_thumb_${asset.id}.jpg`);
  if (!fs.existsSync(tmpPath)) {
    fs.writeFileSync(tmpPath, createFallbackThumbnailBuffer());
  }
  return { thumbnailPath: tmpPath, isFallback: true };
}
