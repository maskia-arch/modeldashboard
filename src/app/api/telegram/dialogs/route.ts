import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { getUserbotConfigs } from "@/lib/telegram-stars";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "MASTER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const configs = getUserbotConfigs();
  if (configs.length === 0) {
    return NextResponse.json({
      success: false,
      error: "Kein Telegram Userbot konfiguriert (TELEGRAM_SESSION_STRING fehlt).",
      dialogs: [],
      activeUserbotsCount: 0,
    });
  }

  const seenChannelMap = new Map<string, any>();
  const botErrors: string[] = [];

  for (const config of configs) {
    let client: TelegramClient | null = null;
    try {
      const session = new StringSession(config.sessionString);
      client = new TelegramClient(session, config.apiId, config.apiHash, {
        connectionRetries: 3,
      });
      await client.connect();

      const dialogs = await client.getDialogs({ limit: 100 });

      for (const d of dialogs) {
        if (d.isChannel || d.isGroup) {
          const entity: any = d.entity;
          const isCreator = Boolean(entity?.creator);
          const isAdmin = Boolean(entity?.adminRights);
          const channelId = String(d.id);

          const item = {
            id: channelId,
            title: d.title || (entity?.title ?? "Unnamed"),
            username: entity?.username ? `@${entity.username}` : null,
            isChannel: Boolean(d.isChannel),
            isGroup: Boolean(d.isGroup),
            type: d.isChannel ? "channel" : "group",
            participantsCount: entity?.participantsCount ?? null,
            isCreator,
            isAdmin,
            userbotIndex: config.index,
            userbotLabel: config.label,
          };

          // If channel was already found on another bot, prioritize the one where the bot has creator/admin rights
          if (seenChannelMap.has(channelId)) {
            const existing = seenChannelMap.get(channelId);
            if ((isCreator && !existing.isCreator) || (isAdmin && !existing.isAdmin)) {
              seenChannelMap.set(channelId, item);
            }
          } else {
            seenChannelMap.set(channelId, item);
          }
        }
      }
    } catch (err: any) {
      console.error(`[Telegram Dialogs API] Error fetching dialogs for ${config.label}:`, err.message);
      botErrors.push(`${config.label}: ${err.message}`);
    } finally {
      if (client) {
        try {
          await client.disconnect();
        } catch {}
      }
    }
  }

  const formattedDialogs = Array.from(seenChannelMap.values());

  // Sort: Channels where bot is Creator first, then Admin, then by title
  formattedDialogs.sort((a, b) => {
    const aPriority = a.isCreator ? 2 : a.isAdmin ? 1 : 0;
    const bPriority = b.isCreator ? 2 : b.isAdmin ? 1 : 0;
    if (aPriority !== bPriority) return bPriority - aPriority;
    return a.title.localeCompare(b.title);
  });

  return NextResponse.json({
    success: true,
    dialogs: formattedDialogs,
    activeUserbotsCount: configs.length,
    warnings: botErrors.length > 0 ? botErrors : undefined,
  });
}
