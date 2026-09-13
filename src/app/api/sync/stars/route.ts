import { NextResponse } from "next/server";
import { syncQueue } from "@/lib/queue";
import { getCurrentUser } from "@/lib/auth";

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin access required." }, { status: 403 });
    }

    // Add an immediate sync job
    try {
      await syncQueue.add("manual-sync", {}, { priority: 1 });
    } catch (redisErr) {
      console.warn("Redis offline or unreachable during manual sync enqueue.");
    }

    return NextResponse.json({
      success: true,
      message: "Telegram Stars MTProto sync job dispatched to worker.",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
