import fs from "fs";
import path from "path";
import { getAssetLocalPath } from "./assets";

/**
 * Returns the primary local path of a video's thumbnail image (.jpg).
 * e.g. /path/to/video.mp4 -> /path/to/video.jpg
 */
export function getExpectedVideoThumbnailPath(videoFilePath: string): string {
  return videoFilePath.replace(/\.(mp4|mov|mkv|avi|webm)$/i, ".jpg");
}

/**
 * Checks if a video thumbnail already exists on disk across primary and secondary directories.
 */
export function findExistingVideoThumbnail(videoFilePath: string): string | null {
  const candidates = [
    videoFilePath.replace(/\.(mp4|mov|mkv|avi|webm)$/i, ".jpg"),
    videoFilePath.replace(/\.(mp4|mov|mkv|avi|webm)$/i, ".png"),
    videoFilePath.replace(/\.(mp4|mov|mkv|avi|webm)$/i, ".webp"),
    videoFilePath.replace(/\.[^/.]+$/, "_thumb.jpg"),
  ];

  // Also check corresponding root uploads path if in public/uploads or vice versa
  for (const c of [...candidates]) {
    if (c.includes(path.join("public", "uploads"))) {
      candidates.push(c.replace(path.join("public", "uploads"), "uploads"));
    } else if (c.includes(path.join(process.cwd(), "uploads"))) {
      candidates.push(c.replace(path.join(process.cwd(), "uploads"), path.join(process.cwd(), "public", "uploads")));
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      try {
        const stat = fs.statSync(candidate);
        if (stat.size > 200) return candidate;
      } catch {}
    }
  }

  return null;
}

/**
 * Resolves the path to the ffmpeg executable (from ffmpeg-static or system PATH).
 */
export async function getFfmpegBinaryPath(): Promise<string> {
  try {
    const ffmpegStatic = await import("ffmpeg-static");
    const binary = (ffmpegStatic.default || ffmpegStatic) as string;
    if (binary && fs.existsSync(binary)) {
      return binary;
    }
  } catch {}

  return "ffmpeg";
}

/**
 * Extracts a frame from a local video file using FFmpeg and saves it as high-quality JPEG.
 */
export async function extractVideoThumbnailWithFfmpeg(
  videoFilePath: string,
  outputJpgPath: string,
  seekSeconds: number = 1
): Promise<boolean> {
  try {
    if (!fs.existsSync(videoFilePath)) return false;

    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const execFileAsync = promisify(execFile);

    const ffmpegBinary = await getFfmpegBinaryPath();

    const dir = path.dirname(outputJpgPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const seekTime = `00:00:${String(Math.max(0, Math.floor(seekSeconds))).padStart(2, "0")}`;

    await execFileAsync(ffmpegBinary, [
      "-y",
      "-ss",
      seekTime,
      "-i",
      videoFilePath,
      "-vframes",
      "1",
      "-q:v",
      "2",
      outputJpgPath,
    ]);

    if (fs.existsSync(outputJpgPath)) {
      const stat = await fs.promises.stat(outputJpgPath);
      if (stat.size > 200) {
        console.log(`[VideoThumbnail] Extracted thumbnail via FFmpeg (${stat.size} bytes) -> ${outputJpgPath}`);
        return true;
      }
    }
  } catch (err: any) {
    // If seeking at 1s failed (e.g. video shorter than 1s), retry at 0s
    if (seekSeconds > 0) {
      try {
        const { execFile } = await import("child_process");
        const { promisify } = await import("util");
        const execFileAsync = promisify(execFile);
        const ffmpegBinary = await getFfmpegBinaryPath();

        await execFileAsync(ffmpegBinary, [
          "-y",
          "-ss",
          "00:00:00",
          "-i",
          videoFilePath,
          "-vframes",
          "1",
          "-q:v",
          "2",
          outputJpgPath,
        ]);

        if (fs.existsSync(outputJpgPath)) {
          const stat = await fs.promises.stat(outputJpgPath);
          if (stat.size > 200) {
            console.log(`[VideoThumbnail] Extracted thumbnail via FFmpeg at 0s (${stat.size} bytes) -> ${outputJpgPath}`);
            return true;
          }
        }
      } catch {}
    }
    console.warn(`[VideoThumbnail] FFmpeg extraction notice for ${videoFilePath}:`, err.message);
  }

  return false;
}

/**
 * Creates a valid 640x360 JPEG image buffer as high-res fallback if no thumbnail can be extracted.
 * Ensures xAI Grok Vision API and Telegram never fail due to invalid dimensions or broken headers.
 */
export function createFallbackThumbnailBuffer(): Buffer {
  const valid640x360JpegBase64 =
    "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABNAAEBAAAAAAAAAAAAAAAAAAAABwEBAQEAAAAAAAAAAAAAAAAAAAEEEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgBaAKAAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8AjwDQgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/2Q==";
  return Buffer.from(valid640x360JpegBase64, "base64");
}

/**
 * Safely writes a video thumbnail to both primary and secondary upload directories
 * so that Telegram publisher, Grok Vision, and static web serving find it instantly.
 */
export async function saveVideoThumbnailToDisk(
  thumbBuffer: Buffer,
  videoFilePath: string
): Promise<string> {
  const targetThumbPath = getExpectedVideoThumbnailPath(videoFilePath);
  const dir = path.dirname(targetThumbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await fs.promises.writeFile(targetThumbPath, thumbBuffer);

  // Secondary dual-write to root /uploads or public/uploads
  try {
    let altThumbPath: string | null = null;
    if (targetThumbPath.includes(path.join("public", "uploads"))) {
      altThumbPath = targetThumbPath.replace(path.join("public", "uploads"), "uploads");
    } else if (targetThumbPath.includes(path.join(process.cwd(), "uploads"))) {
      altThumbPath = targetThumbPath.replace(path.join(process.cwd(), "uploads"), path.join(process.cwd(), "public", "uploads"));
    }
    if (altThumbPath) {
      const altDir = path.dirname(altThumbPath);
      if (!fs.existsSync(altDir)) fs.mkdirSync(altDir, { recursive: true });
      await fs.promises.writeFile(altThumbPath, thumbBuffer);
    }
  } catch {}

  return targetThumbPath;
}

/**
 * Downloads a video thumbnail directly from a Telegram Message or Document object
 * using GramJS, properly selecting the highest quality thumb size or embedded strippedPhoto.
 */
export async function downloadTelegramVideoThumbnail(
  client: any,
  msg: any,
  outputFilePath: string
): Promise<string | null> {
  try {
    if (!msg || !msg.media) return null;
    const mediaAny = msg.media as any;
    const doc = mediaAny.document;

    const dir = path.dirname(outputFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 1. Direct Stripped Photo Extraction: zero network overhead!
    if (doc?.thumbs && Array.isArray(doc.thumbs)) {
      const { Api } = await import("telegram");
      const { strippedPhotoToJpg } = await import("telegram/Utils");

      const strippedThumb = doc.thumbs.find((t: any) => t instanceof Api.PhotoStrippedSize);
      if (strippedThumb && strippedThumb.bytes) {
        try {
          const jpgBuf = strippedPhotoToJpg(strippedThumb.bytes);
          if (jpgBuf && jpgBuf.length > 100) {
            await fs.promises.writeFile(outputFilePath, jpgBuf);
            console.log(`[VideoThumbnail] Extracted embedded PhotoStrippedSize thumbnail (${jpgBuf.length} bytes) -> ${outputFilePath}`);
            return outputFilePath;
          }
        } catch (stripErr: any) {
          console.warn("[VideoThumbnail] Error decoding strippedPhotoToJpg:", stripErr.message);
        }
      }

      // Check for available thumb sizes to select the highest quality one
      const validThumbs = doc.thumbs.filter(
        (t: any) => !(t instanceof Api.PhotoPathSize) && !(t instanceof Api.PhotoStrippedSize)
      );

      if (validThumbs.length > 0) {
        const bestThumb = validThumbs[validThumbs.length - 1];
        const thumbParam = (bestThumb && "type" in bestThumb) ? bestThumb.type : -1;

        console.log(`[VideoThumbnail] Downloading Telegram thumb (type: ${thumbParam}) to ${outputFilePath}...`);
        await client.downloadMedia(msg, {
          outputFile: outputFilePath,
          thumb: thumbParam,
        });

        if (fs.existsSync(outputFilePath)) {
          const stat = await fs.promises.stat(outputFilePath);
          if (stat.size > 200) {
            return outputFilePath;
          }
        }
      }
    }

    // Fallback attempt: request default thumbnail
    console.log(`[VideoThumbnail] Fallback downloading default thumbnail to ${outputFilePath}...`);
    await client.downloadMedia(msg, {
      outputFile: outputFilePath,
      thumb: 0,
    });

    if (fs.existsSync(outputFilePath)) {
      const stat = await fs.promises.stat(outputFilePath);
      if (stat.size > 200) return outputFilePath;
    }
  } catch (err: any) {
    console.warn(`[VideoThumbnail] downloadTelegramVideoThumbnail failed:`, err.message);
  }

  return null;
}

/**
 * Ensures a video thumbnail exists on disk for a given video file path.
 * 1. Checks if thumbnail already exists.
 * 2. If Telegram client/msg provided, attempts download from Telegram.
 * 3. Uses FFmpeg to extract frame at 1s from the video file.
 * 4. Fallback: writes valid 640x360 placeholder JPEG.
 */
export async function ensureVideoThumbnailExists(
  videoFilePath: string,
  options?: {
    client?: any;
    msg?: any;
    assetId?: string;
    modelSlug?: string;
  }
): Promise<string> {
  const existing = findExistingVideoThumbnail(videoFilePath);
  if (existing) return existing;

  const targetThumbPath = getExpectedVideoThumbnailPath(videoFilePath);

  // 1. If Telegram client and message provided, try Telegram download
  if (options?.client && options?.msg) {
    const downloaded = await downloadTelegramVideoThumbnail(options.client, options.msg, targetThumbPath);
    if (downloaded && fs.existsSync(downloaded)) {
      const buf = await fs.promises.readFile(downloaded);
      await saveVideoThumbnailToDisk(buf, videoFilePath);
      return targetThumbPath;
    }
  }

  // 2. Extract frame using FFmpeg from local video file
  if (fs.existsSync(videoFilePath)) {
    const extracted = await extractVideoThumbnailWithFfmpeg(videoFilePath, targetThumbPath);
    if (extracted && fs.existsSync(targetThumbPath)) {
      const buf = await fs.promises.readFile(targetThumbPath);
      await saveVideoThumbnailToDisk(buf, videoFilePath);
      return targetThumbPath;
    }
  }

  // 3. Fallback: Save valid 640x360 JPEG so Grok Vision and Telegram never fail
  const fallbackBuf = createFallbackThumbnailBuffer();
  await saveVideoThumbnailToDisk(fallbackBuf, videoFilePath);
  return targetThumbPath;
}

/**
 * Resolves or downloads the thumbnail for a video asset:
 * 1. Checks if a thumbnail already exists on disk alongside the video.
 * 2. If missing, attempts extraction via FFmpeg from local video.
 * 3. If missing and Telegram message info is present, downloads via GramJS.
 * 4. Saves the thumbnail to disk so future queries and Telegram posting have the image ready immediately.
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

    // Try FFmpeg extraction first if video file is already on disk
    if (fs.existsSync(localVideoPath)) {
      const targetPath = getExpectedVideoThumbnailPath(localVideoPath);
      const extracted = await extractVideoThumbnailWithFfmpeg(localVideoPath, targetPath);
      if (extracted && fs.existsSync(targetPath)) {
        const buf = await fs.promises.readFile(targetPath);
        await saveVideoThumbnailToDisk(buf, localVideoPath);
        return { thumbnailPath: targetPath, isFallback: false };
      }
    }
  }

  const targetThumbPath = localVideoPath
    ? getExpectedVideoThumbnailPath(localVideoPath)
    : path.join(process.cwd(), "public", "uploads", "models", asset.model?.slug || "general", `thumb_${asset.id}.jpg`);

  // Try downloading thumbnail from Telegram if source message is available
  try {
    const dir = path.dirname(targetThumbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

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
        const { resolveClientAndPeerForChannel } = await import("./telegram-stars");
        const resolved = await resolveClientAndPeerForChannel(sourceConfig.sourceChannelId);

        if (resolved) {
          const { client, peer } = resolved;
          try {
            const messages = await client.getMessages(peer, { ids: [msgId] });
            const msg = messages && messages.length > 0 ? messages[0] : null;

            if (msg && msg.media) {
              console.log(`[VideoThumbnail] Fetching thumbnail from Telegram msg #${msgId} for asset ${asset.id}...`);
              const downloadedPath = await downloadTelegramVideoThumbnail(client, msg, targetThumbPath);
              if (downloadedPath && fs.existsSync(downloadedPath)) {
                const buf = await fs.promises.readFile(downloadedPath);
                await saveVideoThumbnailToDisk(buf, targetThumbPath);
                console.log(`[VideoThumbnail] Successfully cached Telegram thumbnail to disk (${buf.length} bytes) -> ${targetThumbPath}`);
                return { thumbnailPath: targetThumbPath, isFallback: false };
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

    // Fallback: Write valid 640x360 JPEG image
    const fallbackBuf = createFallbackThumbnailBuffer();
    await saveVideoThumbnailToDisk(fallbackBuf, targetThumbPath);
    return { thumbnailPath: targetThumbPath, isFallback: true };
  } catch (err: any) {
    console.warn(`[VideoThumbnail] Error in getOrCreateVideoThumbnail for asset ${asset.id}:`, err.message);
  }

  // Last resort
  const tmpPath = path.join(process.cwd(), "public", "uploads", `fallback_thumb_${asset.id}.jpg`);
  if (!fs.existsSync(tmpPath)) {
    fs.writeFileSync(tmpPath, createFallbackThumbnailBuffer());
  }
  return { thumbnailPath: tmpPath, isFallback: true };
}
