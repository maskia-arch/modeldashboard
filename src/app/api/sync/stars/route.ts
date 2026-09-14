import { NextResponse } from "next/server";
import { syncQueue } from "@/lib/queue";
import { getCurrentUser } from "@/lib/auth";
import { syncAllModelsStars } from "@/lib/telegram-stars";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin access required." }, { status: 403 });
    }

    console.log("[Sync Stars API] Master Admin triggered full Telegram Stars historical & live sync...");
    const syncResult = await syncAllModelsStars();

    // Also dispatch to worker queue if Redis is running
    try {
      await syncQueue.add("manual-sync", {}, { priority: 1 });
    } catch (redisErr) {
      // Redis is optional
    }

    return NextResponse.json({
      success: true,
      message: "Telegram Stars historisch und aktuell erfolgreich synchronisiert.",
      result: syncResult,
    });
  } catch (error: any) {
    console.error("[Sync Stars API] Error during stars sync:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
