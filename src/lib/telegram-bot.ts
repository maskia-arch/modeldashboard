import fs from "fs";
import path from "path";
import { Api, TelegramClient, helpers } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { createTelegramClient, resolveChannelPeer } from "./telegram-stars";
import { getAssetLocalPath } from "./assets";
import { extractMp4DurationFromFile } from "./video-metadata";

export interface SendMediaParams {
  channelId: string;
  fileUrl?: string | null;
  type?: 'PHOTO' | 'VIDEO' | 'TEXT';
  caption: string;
  starsPrice?: number;
}

export interface TelegramPublishResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Normalizes Telegram Channel identifier:
 * - Removes URL prefixes (https://t.me/)
 * - Ensures correct formatting for usernames and channel IDs
 */
export function normalizeTelegramChatId(input: string): string {
  let clean = String(input || "").trim();
  if (!clean) return clean;

  if (clean.includes("t.me/")) {
    clean = clean.split("t.me/")[1].replace(/\//g, "").trim();
    if (clean.startsWith("+") || clean.startsWith("joinchat/")) {
      return clean;
    }
  }

  const isNumeric = /^-?\d+$/.test(clean);
  if (isNumeric) {
    if (clean.startsWith("-100")) {
      return clean;
    }
    if (clean.startsWith("-")) {
      return `-100${clean.slice(1)}`;
    }
    return `-100${clean}`;
  }

  if (!clean.startsWith("@") && !clean.startsWith("-")) {
    return `@${clean}`;
  }

  return clean;
}

/**
 * Translates Userbot / MTProto errors into actionable German text.
 */
function translateUserbotError(err: any, channelId: string): string {
  const msg = (err?.errorMessage || err?.message || String(err)).toLowerCase();

  if (msg.includes("extended_media_peer_invalid")) {
    return `Kanal-Einstellungsfehler (EXTENDED_MEDIA_PEER_INVALID): In diesem Telegram-Kanal (${channelId}) sind bezahlte Medien (Telegram Stars) noch nicht aktiviert oder dem ausführenden Account fehlen die Rechte für bezahlte Inhalte. Bitte stellen Sie in den Kanal-Einstellungen in Telegram sicher, dass das Konto Administratorrechte besitzt und bezahlte Inhalte aktiviert sind. Aus Sicherheitsgründen wurde der VIP-Beitrag NICHT kostenlos veröffentlicht.`;
  }
  if (msg.includes("extended_media_invalid")) {
    return `Telegram-Fehler (EXTENDED_MEDIA_INVALID): Die Mediendatei oder die Parameter für bezahlte Inhalte wurden von Telegram abgelehnt. Bitte stellen Sie sicher, dass das Video ein gültiges Format hat und die Dauer größer als 0 Sekunden ist. Aus Sicherheitsgründen wurde der VIP-Beitrag NICHT kostenlos veröffentlicht.`;
  }
  if (msg.includes("stars_amount_invalid") || msg.includes("extended_media_amount_invalid")) {
    return `Ungültiger Sternepreis: Der Preis für kostenpflichtige Medien muss zwischen 1 und 25.000 Sternen liegen.`;
  }
  if (msg.includes("chat_admin_required") || msg.includes("admin_rank_invalid") || msg.includes("rights")) {
    return `Userbot-Fehler: Dem Userbot fehlen Administrator- oder Schreibrechte im Kanal (${channelId}). Bitte stellen Sie sicher, dass das Userbot-Konto Administrator mit vollen Schreib- und Medienrechten im Kanal ist.`;
  }
  if (msg.includes("chat_write_forbidden") || msg.includes("user_banned_in_channel")) {
    return `Userbot-Fehler: Das Userbot-Konto darf in diesem Kanal (${channelId}) keine Nachrichten posten (Schreibrechte verweigert).`;
  }
  if (msg.includes("channel_private") || msg.includes("peer_id_invalid") || msg.includes("could not find") || msg.includes("not found")) {
    return `Userbot-Fehler: Kanal "${channelId}" konnte nicht gefunden werden oder ist privat. Bitte stellen Sie sicher, dass das Userbot-Konto dem Kanal beigetreten ist.`;
  }
  if (msg.includes("flood_wait")) {
    return `Telegram FloodWait: Der Userbot muss kurz pausieren (Telegram Rate Limit). Bitte versuchen Sie es in wenigen Sekunden erneut.`;
  }
  if (msg.includes("entity") || msg.includes("parse")) {
    return `Formatierungsfehler beim Posten: ${err?.message || msg}`;
  }
  return err?.message || msg || "Unbekannter Telegram Übertragungsfehler";
}

/**
 * Extracts the Telegram Message ID from GramJS responses (Api.Message, Api.Updates, etc.)
 */
function extractMessageId(res: any): string {
  if (!res) return "";
  if (typeof res.id === "number" || typeof res.id === "string") return String(res.id);
  if (Array.isArray(res.updates)) {
    for (const u of res.updates) {
      if (u.message && typeof u.message.id !== "undefined") return String(u.message.id);
      if (typeof u.id !== "undefined") return String(u.id);
    }
  }
  if (Array.isArray(res.messages) && res.messages.length > 0 && res.messages[0].id) {
    return String(res.messages[0].id);
  }
  return String(Date.now());
}

// Reusable cached client instance for fast subsequent dispatches
let cachedUserbotClient: TelegramClient | null = null;

async function getOrInitUserbotClient(): Promise<TelegramClient | null> {
  if (cachedUserbotClient && cachedUserbotClient.connected) {
    return cachedUserbotClient;
  }
  const client = await createTelegramClient();
  if (client) {
    cachedUserbotClient = client;
  }
  return client;
}

/**
 * Publishes content to a Telegram channel via the configured Userbot (GramJS MTProto).
 * Uses the existing Userbot credentials (TELEGRAM_SESSION_STRING, TELEGRAM_API_ID, TELEGRAM_API_HASH).
 */
export async function publishViaUserbot(params: SendMediaParams): Promise<TelegramPublishResult> {
  const channelId = params.channelId ? params.channelId.trim() : "";
  if (!channelId) {
    return {
      success: false,
      error: "Keine Telegram Kanal-ID für dieses Model hinterlegt.",
    };
  }

  const client = await getOrInitUserbotClient();
  if (!client) {
    return {
      success: false,
      error: "Userbot ist nicht verbunden! Bitte stellen Sie sicher, dass TELEGRAM_SESSION_STRING, TELEGRAM_API_ID und TELEGRAM_API_HASH in Ihrer Umgebung konfiguriert sind.",
    };
  }

  try {
    const peer = await resolveChannelPeer(client, channelId);
    if (!peer) {
      return {
        success: false,
        error: `Kanal "${channelId}" konnte im Userbot nicht aufgelöst werden. Bitte prüfen Sie, ob der Userbot Mitglied oder Administrator des Kanals ist.`,
      };
    }

    const localPath = getAssetLocalPath(params.fileUrl);
    const isLocal = !!localPath && fs.existsSync(localPath);

    if (params.fileUrl && params.fileUrl.startsWith("/uploads/") && !isLocal) {
      return {
        success: false,
        error: `Mediendatei nicht auf Festplatte gefunden (${params.fileUrl}). Wurde sie bereits gelöscht oder verschoben?`,
      };
    }

    let sentResult: any;

    // 1. File Upload (Photo or Video)
    if (isLocal && localPath) {
      const isVideo = params.type === "VIDEO" || Boolean(localPath.match(/\.(mp4|mov|mkv|avi|webm)$/i));

      // Extract accurate video duration so Telegram never converts it into a looping GIF
      let durationSec = 10;
      if (isVideo) {
        const extracted = await extractMp4DurationFromFile(localPath);
        if (extracted && extracted > 0) {
          durationSec = extracted;
        }
      }

      const videoAttributes = isVideo
        ? [
            new Api.DocumentAttributeVideo({
              duration: durationSec,
              w: 720,
              h: 1280,
              supportsStreaming: true,
            }),
            new Api.DocumentAttributeFilename({
              fileName: path.basename(localPath),
            }),
          ]
        : undefined;

      // 1a. Paid Media Paywall (> 0 Stars)
      if (params.starsPrice && params.starsPrice > 0) {
        console.log(`[Userbot Publisher] Uploading paid media (${params.starsPrice} Stars, isVideo=${isVideo}, duration=${durationSec}s) to ${channelId}...`);
        try {
          const stat = fs.statSync(localPath);
          const customFile = new CustomFile(path.basename(localPath), stat.size, localPath);
          const uploadedFile = await client.uploadFile({
            file: customFile,
            workers: 4,
          });

          const mediaItem = isVideo
            ? new Api.InputMediaUploadedDocument({
                file: uploadedFile,
                mimeType: "video/mp4",
                attributes: videoAttributes!,
                nosoundVideo: false,
              })
            : new Api.InputMediaUploadedPhoto({ file: uploadedFile });

          const paidMedia = new Api.InputMediaPaidMedia({
            starsAmount: BigInt(params.starsPrice) as any,
            extendedMedia: [mediaItem],
          });

          sentResult = await client.invoke(
            new Api.messages.SendMedia({
              peer,
              media: paidMedia,
              message: params.caption || "",
              randomId: helpers.generateRandomLong(),
            })
          );
        } catch (paidErr: any) {
          console.warn(`[Userbot Publisher] Paid media send via Userbot failed: ${paidErr.message}`);

          // If Telegram Bot Token is configured, attempt fallback to Telegram Bot API sendPaidMedia
          const hasBotToken = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== "demo_token");
          if (hasBotToken) {
            console.log(`[Userbot Publisher] Attempting paid media fallback via Telegram Bot API sendPaidMedia...`);
            const botFallbackResult = await publishPaidMediaViaBotApi(params, localPath, isVideo);
            if (botFallbackResult.success) {
              return botFallbackResult;
            }
            console.warn(`[Userbot Publisher] Bot API paid fallback also failed: ${botFallbackResult.error}`);
          }

          // CRITICAL: NEVER drop the paywall! Under NO circumstances post paid VIP content for free!
          return {
            success: false,
            error: translateUserbotError(paidErr, channelId),
          };
        }
      } else {
        // 1b. Standard Free Media (Photo or Video)
        console.log(`[Userbot Publisher] Sending free media via sendFile (isVideo=${isVideo}, duration=${durationSec}s) to ${channelId}...`);
        try {
          sentResult = await client.sendFile(peer, {
            file: localPath,
            caption: params.caption || "",
            parseMode: "html",
            forceDocument: false,
            supportsStreaming: isVideo,
            attributes: videoAttributes,
            workers: 4,
          });
        } catch (parseErr: any) {
          console.warn(`[Userbot Publisher] Retrying sendFile without HTML parsing: ${parseErr.message}`);
          sentResult = await client.sendFile(peer, {
            file: localPath,
            caption: params.caption || "",
            forceDocument: false,
            supportsStreaming: isVideo,
            attributes: videoAttributes,
            workers: 4,
          });
        }
      }
    } else if (params.caption) {
      // 2. Text-only message
      console.log(`[Userbot Publisher] Sending text message to ${channelId}...`);
      try {
        sentResult = await client.sendMessage(peer, {
          message: params.caption,
          parseMode: "html",
        });
      } catch {
        sentResult = await client.sendMessage(peer, {
          message: params.caption,
        });
      }
    } else {
      return {
        success: false,
        error: "Keine Mediendatei und kein Text zum Posten angegeben.",
      };
    }

    const messageId = extractMessageId(sentResult);
    console.log(`[Userbot Publisher] Post published successfully to ${channelId}, Message ID: ${messageId}`);

    return {
      success: true,
      messageId,
    };
  } catch (error: any) {
    console.error(`[Userbot Publisher] Error publishing to ${channelId}:`, error);
    return {
      success: false,
      error: translateUserbotError(error, channelId),
    };
  }
}

/**
 * Helper to publish Paid Media (> 0 Stars) via Telegram Bot API (sendPaidMedia).
 */
async function publishPaidMediaViaBotApi(
  params: SendMediaParams,
  localPath: string,
  isVideo: boolean
): Promise<TelegramPublishResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "demo_token") {
    return { success: false, error: "Kein Bot-Token konfiguriert." };
  }

  const chatId = normalizeTelegramChatId(params.channelId);
  const baseUrl = `https://api.telegram.org/bot${token}`;

  try {
    const fileBuffer = await fs.promises.readFile(localPath);
    const fileName = path.basename(localPath);
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("star_count", String(Math.max(1, params.starsPrice || 100)));

    const mediaItem = {
      type: isVideo ? "video" : "photo",
      media: `attach://${fileName}`,
      ...(isVideo ? { supports_streaming: true } : {}),
    };
    formData.append("media", JSON.stringify([mediaItem]));
    if (params.caption) {
      formData.append("caption", params.caption);
    }
    formData.append(fileName, new Blob([fileBuffer]), fileName);

    const res = await fetch(`${baseUrl}/sendPaidMedia`, { method: "POST", body: formData });
    const data = await res.json();
    if (!data.ok) {
      return { success: false, error: data.description || "sendPaidMedia failed" };
    }
    const messageId = String(data.result?.message_id || data.result?.[0]?.message_id || "");
    return { success: true, messageId };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Fallback implementation using Telegram Bot API (HTTP) if Bot Token is provided.
 */
async function publishViaBotApi(params: SendMediaParams): Promise<TelegramPublishResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || token === "demo_token") {
    return {
      success: false,
      error: "Weder Userbot-Sitzung (TELEGRAM_SESSION_STRING) noch ein gültiger TELEGRAM_BOT_TOKEN konfiguriert.",
    };
  }

  const chatId = normalizeTelegramChatId(params.channelId);
  const baseUrl = `https://api.telegram.org/bot${token}`;

  try {
    const localPath = getAssetLocalPath(params.fileUrl);
    const isLocal = !!localPath && fs.existsSync(localPath);

    if (isLocal && localPath) {
      const isVideo = params.type === "VIDEO" || Boolean(localPath.match(/\.(mp4|mov|mkv|avi|webm)$/i));

      // If Paid Media is requested, use sendPaidMedia
      if (params.starsPrice && params.starsPrice > 0) {
        return publishPaidMediaViaBotApi(params, localPath, isVideo);
      }

      // Otherwise standard free media
      const fileBuffer = await fs.promises.readFile(localPath);
      const fileName = path.basename(localPath);
      const formData = new FormData();
      formData.append("chat_id", chatId);
      formData.append("caption", params.caption || "");

      const endpoint = isVideo ? "sendVideo" : "sendPhoto";
      const fileField = isVideo ? "video" : "photo";

      if (isVideo) {
        formData.append("supports_streaming", "true");
      }
      formData.append(fileField, new Blob([fileBuffer]), fileName);

      const res = await fetch(`${baseUrl}/${endpoint}`, { method: "POST", body: formData });
      const data = await res.json();
      if (!data.ok) throw new Error(data.description || `${endpoint} failed`);
      return { success: true, messageId: String(data.result?.message_id) };
    } else {
      const res = await fetch(`${baseUrl}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: params.caption }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.description || "sendMessage failed");
      return { success: true, messageId: String(data.result?.message_id) };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * Primary publishing gateway:
 * Prioritizes the configured Userbot (GramJS MTProto), with optional Bot API fallback.
 */
export async function publishToTelegram(params: SendMediaParams): Promise<TelegramPublishResult> {
  const sessionString = process.env.TELEGRAM_SESSION_STRING;
  const apiId = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;

  const hasUserbotConfig = Boolean(
    sessionString &&
    sessionString.length > 20 &&
    apiId &&
    apiId !== "123456" &&
    apiHash &&
    apiHash !== "demo_hash"
  );

  // If Userbot is configured, publish exclusively via Userbot
  if (hasUserbotConfig) {
    return publishViaUserbot(params);
  }

  // If Userbot is not yet logged in on this environment, check if a Bot Token exists
  const hasBotToken = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== "demo_token");
  if (hasBotToken) {
    return publishViaBotApi(params);
  }

  // If neither is configured, prompt user clearly to configure the Userbot
  return {
    success: false,
    error: "Userbot nicht konfiguriert! Bitte stellen Sie sicher, dass TELEGRAM_SESSION_STRING, TELEGRAM_API_ID und TELEGRAM_API_HASH in Ihrer .env Datei bzw. in Coolify hinterlegt sind (oder führen Sie 'npm run telegram:login' aus).",
  };
}
