import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { publishToTelegram } from "@/lib/telegram-bot";
import { deleteAssetLocalFile } from "@/lib/assets";

export const dynamic = "force-dynamic";

/**
 * POST /api/posts/publish-direct:
 * Immediately publishes media to a Telegram channel with custom caption & stars price,
 * and subsequently deletes the used media file from disk to avoid duplicates.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized. Only Master Admin can publish posts directly." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { modelId, assetId, postId, caption, starsPrice } = body;

    if (!caption || caption.trim().length === 0) {
      return NextResponse.json({ error: "Caption is required" }, { status: 400 });
    }

    const price = typeof starsPrice === "number" ? Math.max(0, starsPrice) : 0;

    // Case A: Publishing an existing Post by postId
    if (postId) {
      const post = await prisma.post.findUnique({
        where: { id: postId },
        include: { model: true, asset: true },
      });

      if (!post) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
      }

      console.log(`[DirectPublish] Publishing existing post ${postId} to ${post.model.telegramChannelId}...`);

      const result = await publishToTelegram({
        channelId: post.model.telegramChannelId,
        fileUrl: post.asset?.fileUrl,
        type: post.asset?.type || "PHOTO",
        caption: caption.trim(),
        starsPrice: price,
      });

      if (!result.success) {
        await prisma.post.update({
          where: { id: post.id },
          data: { status: "FAILED" },
        });
        return NextResponse.json({ error: result.error || "Failed to publish to Telegram" }, { status: 502 });
      }

      // Update post to PUBLISHED
      const updatedPost = await prisma.post.update({
        where: { id: post.id },
        data: {
          status: "PUBLISHED",
          caption: caption.trim(),
          starsPrice: price,
          telegramMsgId: result.messageId,
        },
      });

      // Mark asset as used and delete local file from disk to avoid duplicates
      if (post.asset) {
        await prisma.asset.update({
          where: { id: post.asset.id },
          data: { isUsed: true },
        });

        await deleteAssetLocalFile(post.asset.fileUrl);
      }

      return NextResponse.json({
        success: true,
        post: updatedPost,
        messageId: result.messageId,
        message: "Post successfully published to Telegram and media cleaned from disk!",
      });
    }

    // Case B: Publishing an Asset directly
    if (assetId && modelId) {
      const model = await prisma.model.findUnique({ where: { id: modelId } });
      const asset = await prisma.asset.findUnique({ where: { id: assetId } });

      if (!model || !asset) {
        return NextResponse.json({ error: "Model or Asset not found" }, { status: 404 });
      }

      console.log(`[DirectPublish] Publishing asset ${assetId} directly to ${model.telegramChannelId}...`);

      const result = await publishToTelegram({
        channelId: model.telegramChannelId,
        fileUrl: asset.fileUrl,
        type: asset.type,
        caption: caption.trim(),
        starsPrice: price,
      });

      if (!result.success) {
        return NextResponse.json({ error: result.error || "Failed to publish to Telegram" }, { status: 502 });
      }

      // Create a PUBLISHED Post record in DB for tracking and history
      const newPost = await prisma.post.create({
        data: {
          modelId: model.id,
          assetId: asset.id,
          caption: caption.trim(),
          starsPrice: price,
          scheduledFor: new Date(),
          status: "PUBLISHED",
          telegramMsgId: result.messageId,
        },
      });

      // Mark asset as used
      await prisma.asset.update({
        where: { id: asset.id },
        data: { isUsed: true },
      });

      // Clean up file from disk
      await deleteAssetLocalFile(asset.fileUrl);

      return NextResponse.json({
        success: true,
        post: newPost,
        messageId: result.messageId,
        message: "Media successfully published to Telegram and cleaned from disk!",
      });
    }

    return NextResponse.json({ error: "Either postId or (modelId + assetId) is required" }, { status: 400 });
  } catch (error: any) {
    console.error("Direct publish error:", error);
    return NextResponse.json({ error: error.message || "Direct publish failed" }, { status: 500 });
  }
}
