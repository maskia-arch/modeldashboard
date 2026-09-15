import fs from "fs";
import path from "path";
import { prisma } from "./prisma";
import { createTelegramClient, resolveChannelPeer } from "./telegram-stars";
import { saveUploadedBuffer, getAssetLocalPath, isPhotoExtension, isVideoOrGifExtension } from "./assets";
import { classifyImageWithGrokVision } from "./grok";

const SOURCES_FILE = path.join(process.cwd(), "data", "model-sources.json");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface ModelSourceConfig {
  sourceChannelId: string;
  sourceChannelTitle?: string | null;
  lastSyncedAt?: string | null;
  totalImported?: number;
}

function ensureDataDir(): void {
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function loadAllSources(): Record<string, ModelSourceConfig> {
  ensureDataDir();
  if (!fs.existsSync(SOURCES_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(SOURCES_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveAllSources(data: Record<string, ModelSourceConfig>): void {
  ensureDataDir();
  fs.writeFileSync(SOURCES_FILE, JSON.stringify(data, null, 2), "utf-8");
}

export function getModelSource(modelId: string): ModelSourceConfig | null {
  const all = loadAllSources();
  return all[modelId] || null;
}

export function saveModelSource(
  modelId: string,
  config: Partial<ModelSourceConfig>
): ModelSourceConfig {
  const all = loadAllSources();
  const existing = all[modelId] || { sourceChannelId: "" };
  const updated: ModelSourceConfig = {
    ...existing,
    ...config,
    sourceChannelId: config.sourceChannelId !== undefined ? config.sourceChannelId : existing.sourceChannelId,
  };

  all[modelId] = updated;
  saveAllSources(all);
  return updated;
}

export function deleteModelSource(modelId: string): void {
  const all = loadAllSources();
  delete all[modelId];
  saveAllSources(all);
}

/**
 * Connects Telegram Userbot via GramJS, reads messages with media from the linked source channel,
 * downloads media directly to local disk (public/uploads/models/[slug]/...),
 * and creates unclassified Asset records in the database.
 */
export async function syncMediaFromSourceChannel(
  modelId: string,
  limit: number = 50,
  autoClassifyPhotos: boolean = false,
  offsetId?: number
): Promise<{
  success: boolean;
  importedCount: number;
  skippedCount?: number;
  hasMore?: boolean;
  nextOffsetId?: number | null;
  message: string;
  error?: string;
}> {
  const model = await prisma.model.findUnique({ where: { id: modelId } });
  if (!model) {
    return { success: false, importedCount: 0, message: "Model not found" };
  }

  const sourceConfig = getModelSource(modelId);
  if (!sourceConfig || !sourceConfig.sourceChannelId) {
    return {
      success: false,
      importedCount: 0,
      message: "Kein Quell-Kanal für dieses Model konfiguriert.",
    };
  }

  const client = await createTelegramClient();
  if (!client) {
    return {
      success: false,
      importedCount: 0,
      message: "Telegram Userbot ist nicht konfiguriert (TELEGRAM_SESSION_STRING fehlt).",
    };
  }

  try {
    console.log(`[SourceChannel] Resolving source peer ${sourceConfig.sourceChannelId} for model ${model.name}...`);
    const peer = await resolveChannelPeer(client, sourceConfig.sourceChannelId);
    if (!peer) {
      throw new Error(`Quellkanal ${sourceConfig.sourceChannelId} konnte nicht aufgelöst werden.`);
    }

    // Load existing assets for this model to build fast lookup of already imported message IDs
    const existingAssets = await prisma.asset.findMany({
      where: { modelId: model.id },
      select: { id: true, notes: true, fileUrl: true },
    });

    const existingMsgMap = new Map<number, { id: string; fileUrl: string | null; notes: string | null }>();
    const msgRegex = /Nachricht #(\d+)/;
    for (const asset of existingAssets) {
      if (asset.notes) {
        const match = asset.notes.match(msgRegex);
        if (match) {
          existingMsgMap.set(parseInt(match[1], 10), asset);
        }
      }
    }

    console.log(`[SourceChannel] Found ${existingAssets.length} existing assets (${existingMsgMap.size} mapped to source messages) for ${model.name}.`);

    const isAll = limit === 0;
    const batchStartTime = Date.now();
    const MAX_BATCH_DURATION_MS = 22000; // 22 seconds safety threshold to avoid proxy 504 timeouts
    const MAX_ITEMS_PER_BATCH = 25; // max items processed in a single batch

    console.log(`[SourceChannel] ${isAll ? "Scanning ALL messages" : `Fetching up to ${limit} messages`} from source channel (offsetId: ${offsetId || "none"})...`);

    const iterParams: any = {};
    if (offsetId && offsetId > 0) {
      iterParams.offsetId = offsetId;
    }
    if (!isAll) {
      iterParams.limit = limit;
    }

    let importedCount = 0;
    let skippedExistingCount = 0;
    let hasMore = false;
    let nextOffsetId: number | null = null;

    for await (const msg of client.iterMessages(peer, iterParams)) {
      // Check if time budget or item limit exceeded BEFORE processing next item
      const elapsed = Date.now() - batchStartTime;
      const batchProcessed = importedCount + skippedExistingCount;
      if (elapsed > MAX_BATCH_DURATION_MS || batchProcessed >= MAX_ITEMS_PER_BATCH) {
        console.log(`[SourceChannel] Batch safety threshold reached (${elapsed}ms, ${importedCount} imported, ${skippedExistingCount} skipped). Yielding nextOffsetId=${msg.id}`);
        hasMore = true;
        nextOffsetId = msg.id;
        break;
      }

      // Only process messages that contain media
      if (!msg.media) continue;

      // Incremental Update Check:
      // If this message was already imported and the file exists on disk, skip downloading completely!
      const existing = existingMsgMap.get(msg.id);
      if (existing) {
        const localPath = existing.fileUrl ? getAssetLocalPath(existing.fileUrl) : null;
        if (localPath && fs.existsSync(localPath)) {
          skippedExistingCount++;
          continue; // Zero download, zero delay!
        }
      }

      // Determine extension and media type
      let ext = ".jpg";
      let assetType: "PHOTO" | "VIDEO" = "PHOTO";

      const mediaAny: any = msg.media;
      if (mediaAny.document) {
        const mimeType = String(mediaAny.document.mimeType || "");
        if (mimeType.includes("video") || mimeType.includes("mp4")) {
          ext = ".mp4";
          assetType = "VIDEO";
        } else if (mimeType.includes("gif")) {
          ext = ".gif";
          assetType = "VIDEO";
        } else if (mimeType.includes("png")) {
          ext = ".png";
          assetType = "PHOTO";
        } else if (mimeType.includes("webp")) {
          ext = ".webp";
          assetType = "PHOTO";
        } else {
          ext = ".jpg";
          assetType = "PHOTO";
        }
      } else if (mediaAny.photo) {
        ext = ".jpg";
        assetType = "PHOTO";
      }

      const filename = `source_msg_${msg.id}_${Date.now()}${ext}`;

      let buffer: Buffer | undefined = undefined;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`[SourceChannel] Downloading media from msg #${msg.id} (attempt ${attempt}/2)...`);
          const downloadPromise = client.downloadMedia(msg, {}) as Promise<Buffer | Uint8Array | undefined>;
          const timeoutPromise = new Promise<undefined>((_, reject) =>
            setTimeout(() => reject(new Error("Telegram Download-Timeout (> 25s)")), 25000)
          );

          const res = await Promise.race([downloadPromise, timeoutPromise]);
          if (res) {
            if (Buffer.isBuffer(res) && res.length > 0) {
              buffer = res;
              break;
            } else if (res instanceof Uint8Array && res.byteLength > 0) {
              buffer = Buffer.from(res);
              break;
            }
          }
        } catch (err: any) {
          console.warn(`[SourceChannel] Download attempt ${attempt}/2 for msg #${msg.id} failed:`, err.message);
          if (attempt < 2) await sleep(500);
        }
      }

      try {
        if (buffer && Buffer.isBuffer(buffer) && buffer.length > 0) {
          const { fileUrl, filePath, size, hash } = await saveUploadedBuffer(buffer, filename, model.slug);
          console.log(`[SourceChannel] Message #${msg.id}: verified ${size} bytes saved to disk at ${filePath}`);

          // Check if identical content hash already exists for this model
          const { findDuplicateAsset } = await import("@/lib/storage");
          const duplicate = await findDuplicateAsset(model.id, hash);

          if (duplicate) {
            console.log(`[SourceChannel] Message #${msg.id}: duplicate content detected (matches asset #${duplicate.id}). Skipping to save storage.`);
            const { deleteAssetLocalFile } = await import("@/lib/assets");
            await deleteAssetLocalFile(fileUrl);
            skippedExistingCount++;
            continue;
          }

          const isVideo = assetType === "VIDEO" || isVideoOrGifExtension(filename);

          // Immortal Database Backup for photos <= 2.5 MB: preserves image even if source channel is dissolved!
          let backupTag = "";
          if (!isVideo && buffer.length <= 2.5 * 1024 * 1024) {
            const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
            backupTag = ` | [BACKUP_DATA:data:${mime};base64,${buffer.toString("base64")}]`;
          }

          // Check if an asset with caption / source message already exists
          const sourceNote = `Aus Quellkanal importiert (Nachricht #${msg.id})`;

          if (existing) {
            // Restore missing disk file for existing asset
            console.log(`[SourceChannel] Restored missing disk file for existing asset #${existing.id} (msg #${msg.id}).`);
            const updatedNotes = existing.notes
              ? existing.notes.includes("[BACKUP_DATA:")
                ? existing.notes
                : existing.notes + backupTag
              : backupTag;

            await prisma.asset.update({
              where: { id: existing.id },
              data: {
                fileUrl,
                notes: updatedNotes.includes("[HASH:") ? updatedNotes : `${updatedNotes} | [HASH:${hash}]`,
              },
            });
            importedCount++;
          } else {
            const rawCaption = msg.message ? String(msg.message).trim() : "";

            // Extract video duration from Telegram attributes if present
            let durationTag = "";
            if (isVideo) {
              const docAttrs = (mediaAny.document?.attributes || []) as any[];
              for (const attr of docAttrs) {
                if (typeof attr.duration === "number" && attr.duration > 0) {
                  durationTag = ` | [DURATION:${Math.round(attr.duration)}s]`;
                  break;
                }
              }
            }

            let assetTitle = rawCaption ? rawCaption.slice(0, 50) : `Quell-Medium #${msg.id}`;
            let assetTheme = "Unklassifiziert";
            let assetLevel: "TEASER" | "SOFT" | "PPV" = "TEASER";
            let assetTags = ["quelle", "telegram", model.slug, "unclassified"];
            let assetNotes = sourceNote + (rawCaption ? ` | Caption: "${rawCaption}"` : "") + durationTag + backupTag + ` | [HASH:${hash}]`;

            // If auto-classify is requested and it's a photo, run Grok 4.1 Vision immediately
            if (autoClassifyPhotos && !isVideo) {
              const localPath = getAssetLocalPath(fileUrl);
              if (localPath) {
                try {
                  console.log(`[SourceChannel] Auto-classifying photo from msg #${msg.id} with Grok Vision...`);
                  const grokRes = await classifyImageWithGrokVision({
                    localFilePath: localPath,
                    modelName: model.name,
                  });
                  assetTitle = grokRes.title || assetTitle;
                  assetTheme = grokRes.theme || "Allgemein";
                  assetLevel = grokRes.explicitLevel || "TEASER";
                  assetTags = ["quelle", "telegram", model.slug, ...(grokRes.tags || [])];
                  assetNotes += ` | Grok: ${grokRes.notes} | Caption: "${grokRes.suggestedCaption}" | Stars: ${grokRes.suggestedStarsPrice}`;
                } catch (grokErr: any) {
                  console.warn(`[SourceChannel] Grok classification failed for msg #${msg.id}:`, grokErr.message);
                }
              }
            }

            const newAsset = await prisma.asset.create({
              data: {
                modelId: model.id,
                title: assetTitle,
                theme: assetTheme,
                type: isVideo ? "VIDEO" : "PHOTO",
                explicitLevel: assetLevel,
                notes: assetNotes,
                fileUrl,
                tags: assetTags,
                isUsed: false,
              },
            });

            existingMsgMap.set(msg.id, { id: newAsset.id, fileUrl, notes: assetNotes });
            importedCount++;
          }
        }
      } catch (dlErr: any) {
        console.warn(`[SourceChannel] Failed to process media from msg #${msg.id}:`, dlErr.message);
      }
    }

    // Update config with last sync
    saveModelSource(modelId, {
      lastSyncedAt: new Date().toISOString(),
      totalImported: (sourceConfig.totalImported || 0) + importedCount,
    });

    let message = "";
    if (importedCount === 0 && skippedExistingCount > 0) {
      message = `Quellkanal ist aktuell: Keine neuen Medien gefunden (${skippedExistingCount} bereits im Dashboard vorhanden).`;
    } else if (importedCount > 0 && skippedExistingCount > 0) {
      message = `${importedCount} neue Medien erfolgreich aus dem Quell-Kanal importiert! (${skippedExistingCount} bereits vorhandene übersprungen)`;
    } else if (importedCount > 0) {
      message = `${importedCount} Medien erfolgreich aus dem Quell-Kanal auf die Festplatte geladen!`;
    } else {
      message = "Keine Medien im Quell-Kanal gefunden.";
    }

    console.log(`[SourceChannel] Sync finished for ${model.name}: ${importedCount} imported, ${skippedExistingCount} existing skipped.`);
    return {
      success: true,
      importedCount,
      skippedCount: skippedExistingCount,
      hasMore,
      nextOffsetId,
      message,
    };
  } catch (error: any) {
    console.error("[SourceChannel] Error during media sync:", error);
    return {
      success: false,
      importedCount: 0,
      message: error.message || "Fehler beim Synchronisieren des Quell-Kanals",
      error: error.message,
    };
  } finally {
    try {
      await client.disconnect();
    } catch {}
  }
}

/**
 * On-demand self-healing restoration of an asset's media file.
 * Features triple redundancy:
 * 1. Disk Verification (high-speed local filesystem)
 * 2. Immortal Database Backup (restores photo immediately even if Telegram channel is deleted!)
 * 3. Telegram Channel Re-fetch (if channel is still active)
 */
export async function restoreAssetMediaFile(assetId: string): Promise<{
  success: boolean;
  filePath?: string;
  fileUrl?: string;
  buffer?: Buffer;
  error?: string;
}> {
  try {
    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: { model: true },
    });
    if (!asset) {
      return { success: false, error: "Asset not found" };
    }

    // 1. Check if file is already present on disk and non-empty
    if (asset.fileUrl) {
      const existingPath = getAssetLocalPath(asset.fileUrl);
      if (existingPath && fs.existsSync(existingPath)) {
        const stat = await fs.promises.stat(existingPath);
        if (stat.size > 0) {
          const buffer = await fs.promises.readFile(existingPath);
          return {
            success: true,
            filePath: existingPath,
            fileUrl: asset.fileUrl,
            buffer,
          };
        }
      }
    }

    // 2. Immortal Database Backup: Check if image is preserved in database notes
    const backupMatch = asset.notes?.match(/\[BACKUP_DATA:(data:[^\]]+)\]/);
    if (backupMatch && backupMatch[1]) {
      try {
        console.log(`[AssetRestore] Restoring asset #${asset.id} from immortal database backup...`);
        const dataUri = backupMatch[1];
        const commaIdx = dataUri.indexOf(",");
        if (commaIdx !== -1) {
          const base64Str = dataUri.slice(commaIdx + 1);
          const restoredBuffer = Buffer.from(base64Str, "base64");
          if (restoredBuffer.length > 0) {
            const ext = dataUri.includes("image/png") ? ".png" : dataUri.includes("image/webp") ? ".webp" : ".jpg";
            const filename = `restored_${asset.id}_${Date.now()}${ext}`;
            const { fileUrl, filePath } = await saveUploadedBuffer(restoredBuffer, filename, asset.model.slug);
            await prisma.asset.update({
              where: { id: assetId },
              data: { fileUrl },
            });
            console.log(`[AssetRestore] Successfully restored asset #${asset.id} from database backup to ${filePath}`);
            return {
              success: true,
              filePath,
              fileUrl,
              buffer: restoredBuffer,
            };
          }
        }
      } catch (backupErr: any) {
        console.warn(`[AssetRestore] Failed restoring from database backup:`, backupErr.message);
      }
    }

    // Extract Telegram message ID from asset notes or tags
    const match = asset.notes?.match(/Nachricht #(\d+)/);
    if (!match) {
      return { success: false, error: "No Telegram message reference found in asset notes" };
    }
    const msgId = parseInt(match[1], 10);
    if (isNaN(msgId)) {
      return { success: false, error: "Invalid message ID in asset notes" };
    }

    const sourceConfig = getModelSource(asset.modelId);
    if (!sourceConfig || !sourceConfig.sourceChannelId) {
      return { success: false, error: "Source channel not configured for model" };
    }

    const client = await createTelegramClient();
    if (!client) {
      return { success: false, error: "Telegram Userbot not configured" };
    }

    try {
      const peer = await resolveChannelPeer(client, sourceConfig.sourceChannelId);
      if (!peer) {
        return { success: false, error: "Failed to resolve source channel peer" };
      }

      console.log(`[AssetRestore] Fetching message #${msgId} for asset ${asset.title || asset.id}...`);
      const messages = await client.getMessages(peer, { ids: [msgId] });
      const msg = messages && messages.length > 0 ? messages[0] : null;

      if (!msg || !msg.media) {
        return { success: false, error: `Message #${msgId} does not contain media` };
      }

      let ext = ".jpg";
      const mediaAny: any = msg.media;
      if (mediaAny.document) {
        const mime = String(mediaAny.document.mimeType || "");
        if (mime.includes("video") || mime.includes("mp4")) ext = ".mp4";
        else if (mime.includes("gif")) ext = ".gif";
        else if (mime.includes("png")) ext = ".png";
        else if (mime.includes("webp")) ext = ".webp";
      }

      const filename = `source_msg_${msgId}_${Date.now()}${ext}`;
      let buffer: Buffer | undefined = undefined;
      const downloadPromise = client.downloadMedia(msg, {}) as Promise<Buffer | Uint8Array | undefined>;
      const timeoutPromise = new Promise<undefined>((_, reject) =>
        setTimeout(() => reject(new Error("Telegram Download-Timeout (> 25s)")), 25000)
      );
      const res = await Promise.race([downloadPromise, timeoutPromise]);
      if (res) {
        if (Buffer.isBuffer(res) && res.length > 0) {
          buffer = res;
        } else if (res instanceof Uint8Array && res.byteLength > 0) {
          buffer = Buffer.from(res);
        }
      }

      if (!buffer || buffer.length === 0) {
        return { success: false, error: "Failed to download media buffer from Telegram" };
      }

      const { fileUrl, filePath } = await saveUploadedBuffer(buffer, filename, asset.model.slug);

      await prisma.asset.update({
        where: { id: assetId },
        data: { fileUrl },
      });

      console.log(`[AssetRestore] Restored media for asset ${assetId} -> ${filePath}`);
      return {
        success: true,
        filePath,
        fileUrl,
        buffer,
      };
    } finally {
      try {
        await client.disconnect();
      } catch {}
    }
  } catch (err: any) {
    console.error(`[AssetRestore] Error restoring asset ${assetId}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Attempts self-healing media restoration given a filename.
 */
export async function restoreAssetMediaByFilename(filename: string): Promise<{
  success: boolean;
  filePath?: string;
  fileUrl?: string;
  buffer?: Buffer;
  error?: string;
}> {
  try {
    const cleanFilename = path.basename(filename);
    const asset = await prisma.asset.findFirst({
      where: {
        fileUrl: { contains: cleanFilename },
      },
    });
    if (asset) {
      return await restoreAssetMediaFile(asset.id);
    }

    const match = cleanFilename.match(/source_msg_(\d+)/);
    if (match) {
      const msgId = match[1];
      const fallbackAsset = await prisma.asset.findFirst({
        where: {
          notes: { contains: `Nachricht #${msgId}` },
        },
      });
      if (fallbackAsset) {
        return await restoreAssetMediaFile(fallbackAsset.id);
      }
    }

    return { success: false, error: `No asset found matching filename ${cleanFilename}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
