import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PostStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin access required." }, { status: 403 });
    }

    const { id } = params;
    const body = await req.json();
    const { action, status, caption, starsPrice, scheduledFor } = body;

    const existingPost = await prisma.post.findUnique({
      where: { id },
      include: { asset: true },
    });

    if (!existingPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const updateData: any = {};

    // 1. Check-off as published (Manual post confirmed by admin)
    if (action === "COMPLETE" || status === "PUBLISHED") {
      updateData.status = PostStatus.PUBLISHED;

      // Mark associated asset as used
      if (existingPost.assetId) {
        await prisma.asset.update({
          where: { id: existingPost.assetId },
          data: { isUsed: true },
        });
      }
    } else if (action === "RESET" || status === "SCHEDULED") {
      // Revert from published to scheduled / pending
      const targetDate = scheduledFor ? new Date(scheduledFor) : existingPost.scheduledFor;
      const isPast = targetDate <= new Date();
      updateData.status = isPast ? PostStatus.PENDING : PostStatus.SCHEDULED;

      if (existingPost.assetId) {
        await prisma.asset.update({
          where: { id: existingPost.assetId },
          data: { isUsed: false },
        });
      }
    }

    if (caption !== undefined) updateData.caption = caption;
    if (starsPrice !== undefined) updateData.starsPrice = parseInt(starsPrice, 10) || 0;
    if (scheduledFor !== undefined) {
      const newDate = new Date(scheduledFor);
      updateData.scheduledFor = newDate;
      if (updateData.status !== PostStatus.PUBLISHED && existingPost.status !== PostStatus.PUBLISHED) {
        updateData.status = newDate <= new Date() ? PostStatus.PENDING : PostStatus.SCHEDULED;
      }
    }

    const updatedPost = await prisma.post.update({
      where: { id },
      data: updateData,
      include: {
        model: {
          select: { id: true, name: true, slug: true, telegramChannelId: true, channelTitle: true },
        },
        asset: true,
      },
    });

    return NextResponse.json(updatedPost);
  } catch (error: any) {
    console.error("Error updating schedule post:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin access required." }, { status: 403 });
    }

    const { id } = params;
    const post = await prisma.post.findUnique({ where: { id } });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Release asset if linked
    if (post.assetId) {
      await prisma.asset.update({
        where: { id: post.assetId },
        data: { isUsed: false },
      });
    }

    await prisma.post.delete({ where: { id } });

    return NextResponse.json({ success: true, message: "Post deleted" });
  } catch (error: any) {
    console.error("Error deleting schedule post:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
