import fs from "fs";
import path from "path";
import { getAssetLocalPath } from "./assets";

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
 * Publishes content to a Telegram channel via Bot API.
 * Supports free posts (sendPhoto, sendVideo, sendMessage) and paid paywall posts (sendPaidMedia).
 * Handles both remote HTTP URLs and local files on disk (/uploads/...).
 */
export async function publishToTelegram(params: SendMediaParams): Promise<TelegramPublishResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token || token === "demo_token") {
    console.warn(`[TelegramBot] No live TELEGRAM_BOT_TOKEN set. Simulating publish to ${params.channelId}`);
    return {
      success: true,
      messageId: `sim_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    };
  }

  const baseUrl = `https://api.telegram.org/bot${token}`;

  try {
    const localPath = getAssetLocalPath(params.fileUrl);
    const isLocal = !!localPath && fs.existsSync(localPath);

    // 1. Paid Media Paywall (> 0 Stars)
    if (params.starsPrice && params.starsPrice > 0 && params.fileUrl) {
      const mediaType = params.type === 'VIDEO' ? 'video' : 'photo';

      if (isLocal && localPath) {
        const fileBuffer = await fs.promises.readFile(localPath);
        const fileName = path.basename(localPath);
        const formData = new FormData();
        formData.append("chat_id", params.channelId);
        formData.append("star_count", String(params.starsPrice));
        formData.append("caption", params.caption);
        formData.append("parse_mode", "HTML");
        formData.append("media", JSON.stringify([{ type: mediaType, media: "attach://file0" }]));
        formData.append("file0", new Blob([fileBuffer]), fileName);

        const res = await fetch(`${baseUrl}/sendPaidMedia`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.description || 'sendPaidMedia (local file) failed');
        return { success: true, messageId: String(data.result?.message_id || data.result?.id) };
      } else {
        const body = {
          chat_id: params.channelId,
          star_count: params.starsPrice,
          media: [{ type: mediaType, media: params.fileUrl }],
          caption: params.caption,
          parse_mode: 'HTML',
        };

        const res = await fetch(`${baseUrl}/sendPaidMedia`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!data.ok) throw new Error(data.description || 'sendPaidMedia failed');
        return { success: true, messageId: String(data.result?.message_id || data.result?.id) };
      }
    }

    // 2. Free Photo
    if (params.type === 'PHOTO' && params.fileUrl) {
      if (isLocal && localPath) {
        const fileBuffer = await fs.promises.readFile(localPath);
        const fileName = path.basename(localPath);
        const formData = new FormData();
        formData.append("chat_id", params.channelId);
        formData.append("caption", params.caption);
        formData.append("parse_mode", "HTML");
        formData.append("photo", new Blob([fileBuffer]), fileName);

        const res = await fetch(`${baseUrl}/sendPhoto`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.description || 'sendPhoto (local file) failed');
        return { success: true, messageId: String(data.result?.message_id) };
      } else {
        const res = await fetch(`${baseUrl}/sendPhoto`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: params.channelId,
            photo: params.fileUrl,
            caption: params.caption,
            parse_mode: 'HTML',
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.description || 'sendPhoto failed');
        return { success: true, messageId: String(data.result?.message_id) };
      }
    }

    // 3. Free Video
    if (params.type === 'VIDEO' && params.fileUrl) {
      if (isLocal && localPath) {
        const fileBuffer = await fs.promises.readFile(localPath);
        const fileName = path.basename(localPath);
        const formData = new FormData();
        formData.append("chat_id", params.channelId);
        formData.append("caption", params.caption);
        formData.append("parse_mode", "HTML");
        formData.append("video", new Blob([fileBuffer]), fileName);

        const res = await fetch(`${baseUrl}/sendVideo`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.description || 'sendVideo (local file) failed');
        return { success: true, messageId: String(data.result?.message_id) };
      } else {
        const res = await fetch(`${baseUrl}/sendVideo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: params.channelId,
            video: params.fileUrl,
            caption: params.caption,
            parse_mode: 'HTML',
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.description || 'sendVideo failed');
        return { success: true, messageId: String(data.result?.message_id) };
      }
    }

    // 4. Free Text
    const res = await fetch(`${baseUrl}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: params.channelId,
        text: params.caption,
        parse_mode: 'HTML',
      }),
    });
    const data = await res.json();
    if (!data.ok) throw new Error(data.description || 'sendMessage failed');
    return { success: true, messageId: String(data.result?.message_id) };

  } catch (error: any) {
    console.error(`[TelegramBot] Failed to publish post to ${params.channelId}:`, error);
    return {
      success: false,
      error: error.message || 'Unknown Telegram delivery error',
    };
  }
}
