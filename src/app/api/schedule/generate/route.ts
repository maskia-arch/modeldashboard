import { NextResponse } from "next/server";
import { generateGrokSchedule } from "@/lib/grok";
import { prisma } from "@/lib/prisma";
import { getAssetVideoDuration } from "@/lib/video-metadata";

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
    const dbAssets = await prisma.asset.findMany({
      where: { id: { in: assetIds } },
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
    const dbMap = new Map(dbAssets.map((a) => [a.id, a]));

    // Enrich all assets with visual context and video duration
    const enrichedAssets = await Promise.all(
      availableAssets.map(async (raw: any) => {
        const dbAsset = dbMap.get(raw.id) || raw;
        const type = dbAsset.type || raw.type || "PHOTO";
        let duration: number | null = null;
        let durationFormatted: string | null = null;

        if (type === "VIDEO") {
          const durInfo = await getAssetVideoDuration({
            type: "VIDEO",
            notes: dbAsset.notes || raw.notes,
            fileUrl: dbAsset.fileUrl || raw.fileUrl,
          });
          if (durInfo) {
            duration = durInfo.seconds;
            durationFormatted = durInfo.formatted;
          }
        }

        return {
          id: dbAsset.id,
          title: dbAsset.title || raw.title,
          theme: dbAsset.theme || raw.theme,
          notes: dbAsset.notes || raw.notes,
          fileUrl: dbAsset.fileUrl || raw.fileUrl,
          type,
          explicitLevel: dbAsset.explicitLevel || raw.explicitLevel || "TEASER",
          tags: Array.isArray(dbAsset.tags) ? dbAsset.tags : (Array.isArray(raw.tags) ? raw.tags : []),
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
