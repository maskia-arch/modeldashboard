import { NextResponse } from "next/server";
import { generateGrokSchedule } from "@/lib/grok";
import { prisma } from "@/lib/prisma";
import { getAssetVideoDuration } from "@/lib/video-metadata";

import { PostStatus } from "@prisma/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Allow up to 60s for high-quality AI copy & schedule generation

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { modelName, channelTitle, targetDays, postsPerDay, strategy, allowPauseDays, modelTone, availableAssets } = body;

    if (!modelName || !availableAssets || availableAssets.length === 0) {
      return NextResponse.json(
        { error: "modelName and at least one availableAsset are required" },
        { status: 400 }
      );
    }

    // Fetch database asset records to retrieve full notes, fileUrls, and accurate types
    const assetIds = availableAssets.map((a: any) => a.id).filter(Boolean);

    // Find any assets that are already scheduled or published
    const existingPosts = await prisma.post.findMany({
      where: {
        assetId: { in: assetIds },
        status: { in: [PostStatus.SCHEDULED, PostStatus.PENDING, PostStatus.PUBLISHED] },
      },
      select: { assetId: true },
    });
    const scheduledAssetIds = new Set(existingPosts.map((p) => p.assetId).filter(Boolean));

    const dbAssets = await prisma.asset.findMany({
      where: {
        id: { in: assetIds },
        isUsed: false,
      },
      select: {
        id: true,
        title: true,
        theme: true,
        notes: true,
        fileUrl: true,
        type: true,
        explicitLevel: true,
        tags: true,
      },
    });

    const unusedDbAssets = dbAssets.filter((a) => !scheduledAssetIds.has(a.id));

    if (unusedDbAssets.length === 0) {
      return NextResponse.json(
        { error: "Keine unbenutzten Medien vorhanden. Alle Medien wurden bereits eingeplant oder veröffentlicht." },
        { status: 400 }
      );
    }

    // Enrich all unused assets with visual context and video duration
    const enrichedAssets = await Promise.all(
      unusedDbAssets.map(async (dbAsset: any) => {
        const type = dbAsset.type || "PHOTO";
        let duration: number | null = null;
        let durationFormatted: string | null = null;

        if (type === "VIDEO") {
          const durInfo = await getAssetVideoDuration({
            type: "VIDEO",
            notes: dbAsset.notes,
            fileUrl: dbAsset.fileUrl,
          });
          if (durInfo) {
            duration = durInfo.seconds;
            durationFormatted = durInfo.formatted;
          }
        }

        return {
          id: dbAsset.id,
          title: dbAsset.title,
          theme: dbAsset.theme,
          notes: dbAsset.notes,
          fileUrl: dbAsset.fileUrl,
          type,
          explicitLevel: dbAsset.explicitLevel || "TEASER",
          tags: Array.isArray(dbAsset.tags) ? dbAsset.tags : [],
          duration,
          durationFormatted,
        };
      })
    );

    const scheduleResponse = await generateGrokSchedule({
      modelName,
      channelTitle,
      targetDays: targetDays ? parseInt(targetDays, 10) : 30,
      postsPerDay: postsPerDay ? parseInt(postsPerDay, 10) : 1,
      strategy,
      allowPauseDays: typeof allowPauseDays === "boolean" ? allowPauseDays : true,
      modelTone: modelTone || "Playful, alluring, authentic German VIP creator",
      availableAssets: enrichedAssets,
    });

    return NextResponse.json(scheduleResponse);
  } catch (error: any) {
    console.error("Error in schedule generation endpoint:", error);
    return NextResponse.json({ error: error.message || "Failed to generate schedule" }, { status: 500 });
  }
}
