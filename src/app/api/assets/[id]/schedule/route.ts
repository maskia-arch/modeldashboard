import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/assets/[id]/schedule:
 * Schedules an existing asset into a post with customized caption, stars price, and target date.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { scheduledFor, caption, starsPrice } = body;

    if (!scheduledFor || !caption) {
      return NextResponse.json(
        { error: "scheduledFor and caption are required" },
        { status: 400 }
      );
    }

    const asset = await prisma.asset.findUnique({
      where: { id: params.id },
      include: { model: true },
    });

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const targetDate = new Date(scheduledFor);
    if (isNaN(targetDate.getTime())) {
      return NextResponse.json({ error: "Invalid scheduledFor date format" }, { status: 400 });
    }

    const post = await prisma.post.create({
      data: {
        modelId: asset.modelId,
        assetId: asset.id,
        caption: caption.trim(),
        starsPrice: typeof starsPrice === "number" ? Math.max(0, starsPrice) : 0,
        scheduledFor: targetDate,
        status: "SCHEDULED",
      },
    });

    return NextResponse.json({
      success: true,
      post,
      message: "Post successfully scheduled!",
    });
  } catch (error: any) {
    console.error("Scheduling asset error:", error);
    return NextResponse.json({ error: error.message || "Failed to schedule asset" }, { status: 500 });
  }
}
