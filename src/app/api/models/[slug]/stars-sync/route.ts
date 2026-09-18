import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { syncStarsForChannel } from "@/lib/telegram-stars";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized. Nur Master-Administratoren dürfen die Synchronisation manuell anstoßen." },
        { status: 403 }
      );
    }

    const { slug } = params;
    const model = await prisma.model.findFirst({
      where: {
        OR: [{ slug }, { id: slug }],
      },
    });

    if (!model) {
      return NextResponse.json({ error: "Model nicht gefunden." }, { status: 404 });
    }

    if (!model.telegramChannelId) {
      return NextResponse.json(
        { error: "Model hat keine verknüpfte Telegram Channel ID." },
        { status: 400 }
      );
    }

    console.log(`[Stars Sync API] Manual sync triggered for model: ${model.name} (${model.telegramChannelId})`);
    const result = await syncStarsForChannel(model.id, model.telegramChannelId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Synchronisation mit Telegram fehlgeschlagen." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `${result.transactionsCount} Transaktionen und ${result.totalStars} Sterne für "${model.name}" erfolgreich synchronisiert.`,
      result,
    });
  } catch (error: any) {
    console.error("[Stars Sync API] Error:", error);
    return NextResponse.json({ error: error.message || "Interner Serverfehler" }, { status: 500 });
  }
}
