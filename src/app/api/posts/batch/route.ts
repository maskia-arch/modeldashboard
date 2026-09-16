import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { postQueue } from "@/lib/queue";
import { PostStatus } from "@prisma/client";
import { ensureCaptionTimeConsistency } from "@/lib/captions";

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

    const { getGermanDateParts, createGermanDate } = await import("@/lib/timezone");
    const now = new Date();
    const nowGerman = getGermanDateParts(now);

    let baseYear = nowGerman.year;
    let baseMonth = nowGerman.month;
    let baseDay = nowGerman.day;

    if (body.startDate) {
      const [sY, sM, sD] = String(body.startDate).split("-").map(Number);
      if (sY && sM && sD) {
        baseYear = sY;
        baseMonth = sM;
        baseDay = sD;
      }
    }

    const createdPosts = [];

    for (const item of posts) {
      const offset = typeof item.timeOffsetDays === "number" ? item.timeOffsetDays : 0;
      const [hours, minutes] = (item.timeOfDay || "12:00").split(":").map(Number);

      // Construct target Date in exact Europe/Berlin timezone
      let finalDate = createGermanDate(baseYear, baseMonth, baseDay + offset, hours || 12, minutes || 0);

      // Exact timing fix: If scheduled on Day 0 but time has already passed today:
      // Roll forward to tomorrow (Day + 1) at the EXACT planned time of day (e.g. 09:00).
      // NEVER jump to "now + 5 minutes"!
      if (!body.startDate && offset === 0 && finalDate.getTime() <= now.getTime()) {
        finalDate = createGermanDate(baseYear, baseMonth, baseDay + 1, hours || 12, minutes || 0);
      }

      let starsPrice = item.starsPrice || 0;
      if (item.assetId) {
        const assetRecord = await prisma.asset.findUnique({
          where: { id: item.assetId },
          select: { type: true },
        });
        if (assetRecord?.type === "VIDEO") {
          starsPrice = Math.max(starsPrice, 25);
        }
      }

      // Ensure caption is strictly consistent with the scheduled time of day
      const finalCaption = ensureCaptionTimeConsistency(item.caption || "", item.timeOfDay || "12:00");

      const [post] = await prisma.$transaction([
        prisma.post.create({
          data: {
            modelId,
            assetId: item.assetId,
            caption: finalCaption,
            starsPrice: item.starsPrice || 0,
            scheduledFor: finalDate,
            status: PostStatus.SCHEDULED,
          },
        }),
        ...(item.assetId
          ? [
              prisma.asset.update({
                where: { id: item.assetId },
                data: { isUsed: true },
              }),
            ]
          : []),
      ]);

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
