import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { postQueue } from "@/lib/queue";
import { PostStatus } from "@prisma/client";
import { ensureCaptionTimeConsistency } from "@/lib/captions";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

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

    // Prefetch all referenced asset types in ONE query to avoid N+1 database lookups
    const assetIds = Array.from(
      new Set(posts.map((p: any) => p.assetId).filter((id): id is string => Boolean(id)))
    );
    const assetRecords = assetIds.length > 0
      ? await prisma.asset.findMany({
          where: { id: { in: assetIds } },
          select: { id: true, type: true },
        })
      : [];
    const assetTypeMap = new Map(assetRecords.map((a) => [a.id, a.type]));

    // Pre-calculate all post items in memory
    const preparedPosts = posts.map((item: any) => {
      const offset = typeof item.timeOffsetDays === "number" ? item.timeOffsetDays : 0;
      const [hours, minutes] = (item.timeOfDay || "12:00").split(":").map(Number);

      // Construct target Date in exact Europe/Berlin timezone
      let finalDate = createGermanDate(baseYear, baseMonth, baseDay + offset, hours || 12, minutes || 0);

      // Exact timing fix: If scheduled on Day 0 but time has already passed today:
      // Roll forward to tomorrow (Day + 1) at the EXACT planned time of day (e.g. 09:00).
      if (!body.startDate && offset === 0 && finalDate.getTime() <= now.getTime()) {
        finalDate = createGermanDate(baseYear, baseMonth, baseDay + 1, hours || 12, minutes || 0);
      }

      let starsPrice = item.starsPrice || 0;
      if (item.assetId && assetTypeMap.get(item.assetId) === "VIDEO") {
        starsPrice = Math.max(starsPrice, 25);
      }

      // Ensure caption is strictly consistent with the scheduled time of day
      const finalCaption = ensureCaptionTimeConsistency(item.caption || "", item.timeOfDay || "12:00");

      return {
        assetId: item.assetId || null,
        caption: finalCaption,
        starsPrice,
        finalDate,
      };
    });

    // Chunked execution for high volume (e.g. 960+ posts across multi-year schedules)
    const CHUNK_SIZE = 50;
    const createdPosts: any[] = [];
    const MAX_SAFE_DELAY_MS = 2147483647; // Max 32-bit signed int (~24.8 days) for setTimeout in Node.js

    for (let i = 0; i < preparedPosts.length; i += CHUNK_SIZE) {
      const chunk = preparedPosts.slice(i, i + CHUNK_SIZE);
      const chunkAssetIds = Array.from(
        new Set(chunk.map((c) => c.assetId).filter((id): id is string => Boolean(id)))
      );

      const transactionOps: any[] = chunk.map((c) =>
        prisma.post.create({
          data: {
            modelId,
            assetId: c.assetId,
            caption: c.caption,
            starsPrice: c.starsPrice,
            scheduledFor: c.finalDate,
            status: PostStatus.SCHEDULED,
          },
        })
      );

      if (chunkAssetIds.length > 0) {
        transactionOps.push(
          prisma.asset.updateMany({
            where: { id: { in: chunkAssetIds } },
            data: { isUsed: true },
          })
        );
      }

      const results = await prisma.$transaction(transactionOps);
      const chunkCreated = results.slice(0, chunk.length);

      for (const post of chunkCreated) {
        createdPosts.push(post);

        // Queue addition if within safe BullMQ timer delay (posts further out are picked up as they mature)
        const delayMs = Math.max(0, new Date(post.scheduledFor).getTime() - Date.now());
        if (delayMs <= MAX_SAFE_DELAY_MS) {
          try {
            await postQueue.add(
              `post-${post.id}`,
              { postId: post.id },
              {
                delay: delayMs,
                jobId: `post_${post.id}`,
              }
            );
          } catch {
            // BullMQ/Redis offline locally
          }
        }
      }
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
