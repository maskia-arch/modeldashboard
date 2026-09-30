import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "MASTER_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiId = Number(process.env.TELEGRAM_API_ID || "0");
  const apiHash = process.env.TELEGRAM_API_HASH || "";
  const sessionString = process.env.TELEGRAM_SESSION_STRING || "";

  if (!apiId || !apiHash || !sessionString) {
    return NextResponse.json({
      success: false,
      error: "Telegram MTProto credentials not configured.",
      dialogs: [],
    });
  }

  let client: TelegramClient | null = null;
  try {
    const session = new StringSession(sessionString);
    client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 3,
    });
    await client.connect();

    const dialogs = await client.getDialogs({ limit: 100 });
    const formattedDialogs = [];

    for (const d of dialogs) {
      if (d.isChannel || d.isGroup) {
        const entity: any = d.entity;
        const isCreator = Boolean(entity?.creator);
        const isAdmin = Boolean(entity?.adminRights);
        formattedDialogs.push({
          id: String(d.id),
          title: d.title || (entity?.title ?? "Unnamed"),
          username: entity?.username ? `@${entity.username}` : null,
          isChannel: Boolean(d.isChannel),
          isGroup: Boolean(d.isGroup),
          type: d.isChannel ? "channel" : "group",
          participantsCount: entity?.participantsCount ?? null,
          isCreator,
          isAdmin,
        });
      }
    }

    // Sort: Channels where user is Creator/Admin first, then by title
    formattedDialogs.sort((a, b) => {
      const aPriority = a.isCreator ? 2 : a.isAdmin ? 1 : 0;
      const bPriority = b.isCreator ? 2 : b.isAdmin ? 1 : 0;
      if (aPriority !== bPriority) return bPriority - aPriority;
      return a.title.localeCompare(b.title);
    });

    return NextResponse.json({
      success: true,
      dialogs: formattedDialogs,
    });
  } catch (err: any) {
    console.error("[Telegram Dialogs API] Error fetching dialogs:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Failed to fetch Telegram dialogs",
        dialogs: [],
      },
      { status: 500 }
    );
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch {}
    }
  }
}
