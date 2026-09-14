import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PostStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin access required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get("modelId");
    const status = searchParams.get("status");

    const now = new Date();

    // Automatically transition any overdue SCHEDULED posts to PENDING in the DB
    await prisma.post.updateMany({
      where: {
        status: PostStatus.SCHEDULED,
        scheduledFor: { lte: now },
      },
      data: {
        status: PostStatus.PENDING,
      },
    });

    // Build filter query
    const where: any = {};
    if (modelId && modelId !== "ALL") {
      where.modelId = modelId;
    }
    if (status && status !== "ALL") {
      where.status = status as PostStatus;
    }

    const posts = await prisma.post.findMany({
      where,
      include: {
        model: {
          select: {
            id: true,
            name: true,
            slug: true,
            telegramChannelId: true,
            channelTitle: true,
            avatarUrl: true,
          },
        },
        asset: true,
      },
      orderBy: [
        { scheduledFor: "asc" },
      ],
    });

    return NextResponse.json(posts);
  } catch (error: any) {
    console.error("Error fetching schedule posts:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { modelId, assetId, caption, starsPrice, scheduledFor } = body;

    if (!modelId || !caption || !scheduledFor) {
      return NextResponse.json(
        { error: "modelId, caption and scheduledFor are required" },
        { status: 400 }
      );
    }

    const targetDate = new Date(scheduledFor);
    const now = new Date();
    const initialStatus = targetDate <= now ? PostStatus.PENDING : PostStatus.SCHEDULED;

    const post = await prisma.post.create({
      data: {
        modelId,
        assetId: assetId || null,
        caption,
        starsPrice: parseInt(starsPrice, 10) || 0,
        scheduledFor: targetDate,
        status: initialStatus,
      },
      include: {
        model: {
          select: { id: true, name: true, slug: true, telegramChannelId: true, channelTitle: true },
        },
        asset: true,
      },
    });

    return NextResponse.json(post, { status: 201 });
  } catch (error: any) {
    console.error("Error creating schedule post:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/schedule/posts:
 * Clears all unposted (SCHEDULED, PENDING, DRAFT) posts for a specific model or all models,
 * and resets isUsed on their linked assets.
 */
export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin access required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get("modelId");

    const where: any = {
      status: { in: [PostStatus.SCHEDULED, PostStatus.PENDING, PostStatus.DRAFT] },
    };
    if (modelId && modelId !== "ALL") {
      where.modelId = modelId;
    }

    // Find posts to release assets
    const postsToClear = await prisma.post.findMany({
      where,
      select: { id: true, assetId: true },
    });

    const assetIds = postsToClear.map((p) => p.assetId).filter(Boolean) as string[];

    await prisma.$transaction([
      // Release assets
      prisma.asset.updateMany({
        where: { id: { in: assetIds } },
        data: { isUsed: false },
      }),
      // Delete draft & scheduled posts
      prisma.post.deleteMany({
        where,
      }),
    ]);

    return NextResponse.json({
      success: true,
      clearedCount: postsToClear.length,
      message: `${postsToClear.length} ungepostete Zeitplan-Einträge gelöscht und Assets freigegeben.`,
    });
  } catch (error: any) {
    console.error("Error clearing schedule posts:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
