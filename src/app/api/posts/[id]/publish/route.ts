import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { publishToTelegram } from "@/lib/telegram-bot";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Only Master Admin can trigger manual posts." }, { status: 403 });
    }

    const post = await prisma.post.findUnique({
      where: { id: params.id },
      include: { model: true, asset: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    console.log(`[Manual Post] Manually publishing post ${post.id} to ${post.model.telegramChannelId}...`);

    const result = await publishToTelegram({
      channelId: post.model.telegramChannelId,
      fileUrl: post.asset?.fileUrl,
      type: post.asset?.type,
      caption: post.caption,
      starsPrice: post.starsPrice,
    });

    if (result.success) {
      const updatedPost = await prisma.post.update({
        where: { id: post.id },
        data: {
          status: "PUBLISHED",
          telegramMsgId: result.messageId,
        },
      });

      if (post.assetId) {
        await prisma.asset.update({
          where: { id: post.assetId },
          data: { isUsed: true },
        });

        if (post.asset?.fileUrl) {
          const { deleteAssetLocalFile } = await import("@/lib/assets");
          await deleteAssetLocalFile(post.asset.fileUrl);
        }
      }

      return NextResponse.json({
        success: true,
        post: updatedPost,
        messageId: result.messageId,
        message: "Post manually published to Telegram successfully!",
      });
    } else {
      await prisma.post.update({
        where: { id: post.id },
        data: { status: "FAILED" },
      });

      return NextResponse.json({
        error: result.error || "Failed to publish post to Telegram",
      }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Manual publish error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
