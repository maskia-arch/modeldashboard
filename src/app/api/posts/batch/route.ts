import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { postQueue } from "@/lib/queue";
import { PostStatus } from "@prisma/client";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { modelId, posts } = body;

    if (!modelId || !Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json(
        { error: "modelId and a non-empty posts array are required" },
        { status: 400 }
      );
    }

    const createdPosts = [];

    for (const item of posts) {
      // Parse offset and timeOfDay (HH:MM)
      const now = new Date();
      const targetDate = new Date(now);
      targetDate.setDate(targetDate.getDate() + (item.timeOffsetDays || 0));

      const [hours, minutes] = (item.timeOfDay || "12:00").split(":").map(Number);
      targetDate.setHours(hours || 12, minutes || 0, 0, 0);

      // If target time is already in the past for today, push to +5 minutes from now
      const finalDate = targetDate.getTime() <= now.getTime()
        ? new Date(now.getTime() + 5 * 60 * 1000)
        : targetDate;

      const post = await prisma.post.create({
        data: {
          modelId,
          assetId: item.assetId,
          caption: item.caption,
          starsPrice: item.starsPrice || 0,
          scheduledFor: finalDate,
          status: PostStatus.SCHEDULED,
        },
      });

      // Compute BullMQ job delay in milliseconds
      const delayMs = Math.max(0, finalDate.getTime() - Date.now());

      try {
        await postQueue.add(
          `post-${post.id}`,
          { postId: post.id },
          {
            delay: delayMs,
            jobId: `post_${post.id}`,
          }
        );
      } catch (queueErr) {
        console.warn(`[BullMQ] Warning adding job to Redis (Redis might be offline locally):`, queueErr);
      }

      createdPosts.push(post);
    }

    return NextResponse.json({
      success: true,
      count: createdPosts.length,
      posts: createdPosts,
    });
  } catch (error: any) {
    console.error("Error batch scheduling posts:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
