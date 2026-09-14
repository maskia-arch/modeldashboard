import fs from "fs";
import path from "path";
import { prisma } from "./prisma";
import { createTelegramClient, resolveChannelPeer } from "./telegram-stars";
import { saveUploadedBuffer, isPhotoExtension, isVideoOrGifExtension } from "./assets";

const SOURCES_FILE = path.join(process.cwd(), "data", "model-sources.json");

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
  limit: number = 50
): Promise<{ success: boolean; importedCount: number; message: string; error?: string }> {
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

    console.log(`[SourceChannel] Fetching last ${limit} messages from source channel...`);
    const messages = await client.getMessages(peer, { limit });

    let importedCount = 0;

    for (const msg of messages) {
      // Only process messages that contain media
      if (!msg.media) continue;

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

      try {
        console.log(`[SourceChannel] Downloading media from message #${msg.id}...`);
        const buffer = (await client.downloadMedia(msg, {})) as Buffer | undefined;

        if (buffer && Buffer.isBuffer(buffer) && buffer.length > 0) {
          const { fileUrl } = await saveUploadedBuffer(buffer, filename, model.slug);

          // Check if an asset with caption / source message already exists
          const sourceNote = `Aus Quellkanal importiert (Nachricht #${msg.id})`;
          const existing = await prisma.asset.findFirst({
            where: {
              modelId: model.id,
              notes: sourceNote,
            },
          });

          if (!existing) {
            const rawCaption = msg.message ? String(msg.message).trim() : "";
            const isVideo = assetType === "VIDEO" || isVideoOrGifExtension(filename);

            await prisma.asset.create({
              data: {
                modelId: model.id,
                title: rawCaption ? rawCaption.slice(0, 50) : `Quell-Medium #${msg.id}`,
                theme: "Allgemein",
                type: isVideo ? "VIDEO" : "PHOTO",
                explicitLevel: "TEASER", // Starts as TEASER before Grok or manual classification
                notes: sourceNote + (rawCaption ? ` | Caption: "${rawCaption}"` : ""),
                fileUrl,
                tags: ["quelle", "telegram", model.slug],
                isUsed: false,
              },
            });

            importedCount++;
          }
        }
      } catch (dlErr: any) {
        console.warn(`[SourceChannel] Failed to download media from msg #${msg.id}:`, dlErr.message);
      }
    }

    // Update config with last sync
    saveModelSource(modelId, {
      lastSyncedAt: new Date().toISOString(),
      totalImported: (sourceConfig.totalImported || 0) + importedCount,
    });

    console.log(`[SourceChannel] Successfully imported ${importedCount} media items for ${model.name}`);
    return {
      success: true,
      importedCount,
      message: `${importedCount} neue Medien erfolgreich aus dem Quell-Kanal auf die Festplatte geladen!`,
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
