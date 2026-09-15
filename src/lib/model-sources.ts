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
export interface SourceSyncState {
  modelId: string;
  status: "idle" | "running" | "completed" | "error";
  progressMessage: string;
  totalImported: number;
  totalSkipped: number;
  hasMore?: boolean;
  nextOffsetId?: number | null;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

const globalForSync = globalThis as unknown as {
  activeSourceSyncJobs?: Map<string, SourceSyncState>;
};
export const activeSourceSyncJobs =
  globalForSync.activeSourceSyncJobs ||
  (globalForSync.activeSourceSyncJobs = new Map<string, SourceSyncState>());

export function getSourceSyncState(modelId: string): SourceSyncState {
  const existing = activeSourceSyncJobs.get(modelId);
  if (existing) return existing;
  return {
    modelId,
    status: "idle",
    progressMessage: "",
    totalImported: 0,
    totalSkipped: 0,
  };
}

export function startBackgroundSourceSync(
  modelId: string,
  limit: number = 50,
  autoClassifyPhotos: boolean = false,
  offsetId?: number
): SourceSyncState {
  const existing = activeSourceSyncJobs.get(modelId);
  if (existing && existing.status === "running") {
    return existing;
  }

  const state: SourceSyncState = {
    modelId,
    status: "running",
    progressMessage: "Verbindung zum Quellkanal wird aufgebaut...",
    totalImported: 0,
    totalSkipped: 0,
    startedAt: new Date().toISOString(),
  };
  activeSourceSyncJobs.set(modelId, state);

  // Execute asynchronously in the background so the HTTP request returns in ~10ms!
  // This makes Cloudflare 520 / 504 / proxy timeouts 100% impossible.
  (async () => {
    try {
      const result = await syncMediaFromSourceChannelInternal(
        modelId,
        limit,
        autoClassifyPhotos,
        offsetId,
        (progress) => {
          state.progressMessage = progress.message;
          state.totalImported = progress.importedCount;
          state.totalSkipped = progress.skippedCount;
        }
      );

      state.status = result.success ? "completed" : "error";
      state.totalImported = result.importedCount;
      state.totalSkipped = result.skippedCount || 0;
      state.progressMessage = result.message;
      state.hasMore = result.hasMore;
      state.nextOffsetId = result.nextOffsetId;
      state.completedAt = new Date().toISOString();
      if (!result.success) {
        state.error = result.error || result.message;
      }
    } catch (err: any) {
      console.error("[BackgroundSync] Fatal error in background job:", err);
      state.status = "error";
      state.error = err.message || "Unerwarteter Fehler bei der Synchronisation";
      state.progressMessage = `Fehler: ${err.message}`;
      state.completedAt = new Date().toISOString();
    }
  })();

  return state;
}

/**
 * Synchronous wrapper for callers that await the sync.
 */
export async function syncMediaFromSourceChannel(
  modelId: string,
  limit: number = 50,
  autoClassifyPhotos: boolean = false,
  offsetId?: number
) {
  return await syncMediaFromSourceChannelInternal(modelId, limit, autoClassifyPhotos, offsetId);
}

/**
 * Core internal sync engine:
 * - Streams ALL media files of ANY format and ANY size directly to disk (0 RAM buffer).
 * - Processes downloads sequentially to protect Telegram MTProto connection and avoid rate limits.
 */
async function syncMediaFromSourceChannelInternal(
  modelId: string,
  limit: number = 50,
  autoClassifyPhotos: boolean = false,
  offsetId?: number,
  onProgress?: (progress: { importedCount: number; skippedCount: number; message: string }) => void
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
    if (onProgress) onProgress({ importedCount: 0, skippedCount: 0, message: "Quellkanal wird aufgelöst..." });

    const peer = await resolveChannelPeer(client, sourceConfig.sourceChannelId);
    if (!peer) {
      throw new Error(`Quellkanal ${sourceConfig.sourceChannelId} konnte nicht aufgelöst werden.`);
    }

    // Lightweight lookup of already imported Telegram message IDs without loading heavy base64 strings into memory
    const existingMsgIds = new Set<number>();
    try {
      const rawMatches = await prisma.$queryRaw<Array<{ msgIdStr: string | null }>>`
        SELECT SUBSTRING(notes FROM 'Nachricht #([0-9]+)') AS "msgIdStr"
        FROM "Asset"
        WHERE "modelId" = ${model.id} AND notes LIKE '%Nachricht #%'
      `;
      for (const r of rawMatches) {
        if (r.msgIdStr) {
          const parsed = parseInt(r.msgIdStr, 10);
          if (!isNaN(parsed)) existingMsgIds.add(parsed);
        }
      }
    } catch {
      try {
        const fallbackAssets = await prisma.asset.findMany({
          where: { modelId: model.id },
          select: { tags: true, fileUrl: true },
        });
        for (const a of fallbackAssets) {
          for (const t of a.tags) {
            if (t.startsWith("msg_")) {
              const num = parseInt(t.replace("msg_", ""), 10);
              if (!isNaN(num)) existingMsgIds.add(num);
            }
          }
          if (a.fileUrl) {
            const m = a.fileUrl.match(/source_msg_(\d+)/);
            if (m) existingMsgIds.add(parseInt(m[1], 10));
          }
        }
      } catch (fallbackErr: any) {
        console.warn("[SourceChannel] Fallback asset lookup failed:", fallbackErr.message);
      }
    }

    console.log(`[SourceChannel] Found ${existingMsgIds.size} already imported source messages for ${model.name}.`);

    const isAll = limit === 0;
    const targetLimit = limit;

    const iterParams: any = {};
    if (offsetId && offsetId > 0) {
      iterParams.offsetId = offsetId;
    }
    if (!isAll && targetLimit > 0) {
      iterParams.limit = targetLimit;
    }

    let importedCount = 0;
    let skippedExistingCount = 0;
    let consecutiveExistingCount = 0;
    let hasMore = false;
    let nextOffsetId: number | null = null;
    let lastProcessedMsgId: number | null = null;

    const { getUploadsDirectory, sanitizeSlug } = await import("./assets");
    const crypto = await import("crypto");
    const targetDir = getUploadsDirectory(model.slug);

    for await (const msg of client.iterMessages(peer, iterParams)) {
      if (!isAll && importedCount >= targetLimit) {
        hasMore = true;
        nextOffsetId = lastProcessedMsgId || msg.id;
        break;
      }

      // Only process messages that contain media
      if (!msg.media) continue;

      // Incremental Update Check:
      // If this message was already imported, skip downloading immediately!
      if (existingMsgIds.has(msg.id)) {
        skippedExistingCount++;
        consecutiveExistingCount++;
        lastProcessedMsgId = msg.id;

        // Optimization: If we encounter 15 consecutive already-imported messages from newest,
        // all newer messages have been processed and the channel is completely up to date!
        if (!offsetId && consecutiveExistingCount >= 15) {
          console.log(`[SourceChannel] Reached 15 consecutive already imported items. Source channel is up-to-date.`);
          hasMore = false;
          break;
        }
        continue;
      }

      consecutiveExistingCount = 0;

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
        } else if (mimeType.includes("quicktime") || mimeType.includes("mov")) {
          ext = ".mov";
          assetType = "VIDEO";
        } else if (mimeType.includes("audio") || mimeType.includes("ogg") || mimeType.includes("mp3")) {
          ext = ".mp3";
          assetType = "VIDEO";
        } else {
          ext = ".jpg";
          assetType = "PHOTO";
        }
      } else if (mediaAny.photo) {
        ext = ".jpg";
        assetType = "PHOTO";
      }

      const uniqueName = `${Date.now()}_${Math.floor(Math.random() * 10000)}_source_msg_${msg.id}${ext}`;
      const filePath = path.join(targetDir, uniqueName);
      const cleanSlug = sanitizeSlug(model.slug);
      const fileUrl = `/uploads/models/${cleanSlug}/${uniqueName}`;

      if (onProgress) {
        const typeLabel = assetType === "VIDEO" ? "Video" : "Foto";
        const progressMessage = isAll
          ? `📥 Lade ${typeLabel} #${msg.id} auf Festplatte (${importedCount + 1} geladen, ${skippedExistingCount} übersprungen)...`
          : `📥 Lade ${typeLabel} #${msg.id} auf Festplatte (${importedCount + 1}/${targetLimit})...`;
        onProgress({
          importedCount,
          skippedCount: skippedExistingCount,
          message: progressMessage,
        });
      }

      // Stream directly to disk using GramJS outputFile!
      // This supports files of ANY size (10 MB, 100 MB, 500 MB, 1 GB+) with zero RAM buffering!
      let downloadSuccess = false;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`[SourceChannel] Streaming media from msg #${msg.id} directly to disk (attempt ${attempt}/2) -> ${filePath}`);
          await client.downloadMedia(msg, {
            outputFile: filePath,
          });

          if (fs.existsSync(filePath)) {
            const stat = await fs.promises.stat(filePath);
            if (stat.size > 0) {
              downloadSuccess = true;
              break;
            }
          }
        } catch (err: any) {
          console.warn(`[SourceChannel] Stream download attempt ${attempt}/2 for msg #${msg.id} failed:`, err.message);
          if (attempt < 2) await sleep(800);
        }
      }

      if (!downloadSuccess || !fs.existsSync(filePath)) {
        console.warn(`[SourceChannel] Could not download media for msg #${msg.id}. Skipping.`);
        lastProcessedMsgId = msg.id;
        continue;
      }

      try {
        const stat = await fs.promises.stat(filePath);
        console.log(`[SourceChannel] Message #${msg.id}: verified ${stat.size} bytes on disk at ${filePath}`);

        // Stream hash calculation (zero RAM consumption even for 1GB+ files)
        const hash = await new Promise<string>((resolve, reject) => {
          const h = crypto.createHash("sha256");
          const stream = fs.createReadStream(filePath);
          stream.on("data", (chunk) => h.update(chunk));
          stream.on("end", () => resolve(h.digest("hex")));
          stream.on("error", reject);
        });

        // Check if identical content hash already exists for this model
        const { findDuplicateAsset } = await import("@/lib/storage");
        const duplicate = await findDuplicateAsset(model.id, hash);

        if (duplicate) {
          console.log(`[SourceChannel] Message #${msg.id}: duplicate content detected (matches asset #${duplicate.id}). Skipping.`);
          await fs.promises.unlink(filePath).catch(() => {});
          existingMsgIds.add(msg.id);
          skippedExistingCount++;
          lastProcessedMsgId = msg.id;
          continue;
        }

        // Secondary persistence write to root /uploads
        try {
          const secondaryDir = path.join(process.cwd(), "uploads", "models", cleanSlug);
          if (!fs.existsSync(secondaryDir)) {
            fs.mkdirSync(secondaryDir, { recursive: true });
          }
          await fs.promises.copyFile(filePath, path.join(secondaryDir, uniqueName));
        } catch {}

        const isVideo = assetType === "VIDEO" || isVideoOrGifExtension(uniqueName);

        // Safe database backup for small photos (<= 300 KB) only
        let backupTag = "";
        if (!isVideo && stat.size <= 300 * 1024) {
          try {
            const smallBuf = await fs.promises.readFile(filePath);
            const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
            backupTag = ` | [BACKUP_DATA:data:${mime};base64,${smallBuf.toString("base64")}]`;
          } catch {}
        }

        const sourceNote = `Aus Quellkanal importiert (Nachricht #${msg.id})`;
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
        let assetTags = ["quelle", "telegram", model.slug, `msg_${msg.id}`, `hash_${hash}`, "unclassified"];
        let assetNotes = sourceNote + (rawCaption ? ` | Caption: "${rawCaption}"` : "") + durationTag + backupTag + ` | [HASH:${hash}]`;

        // If auto-classify is requested and it's a photo, run Grok Vision
        if (autoClassifyPhotos && !isVideo) {
          try {
            console.log(`[SourceChannel] Auto-classifying photo from msg #${msg.id} with Grok Vision...`);
            const grokRes = await classifyImageWithGrokVision({
              localFilePath: filePath,
              modelName: model.name,
            });
            assetTitle = grokRes.title || assetTitle;
            assetTheme = grokRes.theme || "Allgemein";
            assetLevel = grokRes.explicitLevel || "TEASER";
            assetTags = ["quelle", "telegram", model.slug, `msg_${msg.id}`, `hash_${hash}`, ...(grokRes.tags || [])];
            assetNotes += ` | Grok: ${grokRes.notes} | Caption: "${grokRes.suggestedCaption}" | Stars: ${grokRes.suggestedStarsPrice}`;
          } catch (grokErr: any) {
            console.warn(`[SourceChannel] Grok classification failed for msg #${msg.id}:`, grokErr.message);
          }
        }

        await prisma.asset.create({
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

        existingMsgIds.add(msg.id);
        importedCount++;

        if (onProgress) {
          onProgress({
            importedCount,
            skippedCount: skippedExistingCount,
            message: `✓ Medium #${msg.id} gespeichert (${importedCount} geladen, ${skippedExistingCount} übersprungen)...`,
          });
        }
      } catch (procErr: any) {
        console.warn(`[SourceChannel] Error finalizing media msg #${msg.id}:`, procErr.message);
      }

      lastProcessedMsgId = msg.id;
      // Gentle pause between downloads to protect Telegram MTProto connection
      await sleep(300);
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
      message = `Erfolg: ${importedCount} neue Medien erfolgreich heruntergeladen (${skippedExistingCount} bereits vorhandene übersprungen)!`;
    } else if (importedCount > 0) {
      message = `Erfolg: ${importedCount} Medien erfolgreich auf die Festplatte gespeichert!`;
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
      await Promise.race([
        client.disconnect(),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
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
