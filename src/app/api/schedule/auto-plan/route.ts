import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PostStatus, ExplicitLevel } from "@prisma/client";
import { getGermanDateParts, createGermanDate } from "@/lib/timezone";
import { sanitizeCaptionForMediaType, composeStorylineCaption, ensureCaptionTimeConsistency } from "@/lib/captions";
import { getAssetVideoDuration } from "@/lib/video-metadata";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { modelId, startDate, resetExisting, mode } = body;
    const shouldReset = mode ? mode === "regenerate" : Boolean(resetExisting);

    const modelsToPlan = modelId && modelId !== "ALL"
      ? await prisma.model.findMany({ where: { id: modelId } })
      : await prisma.model.findMany();

    if (modelsToPlan.length === 0) {
      return NextResponse.json({ error: "No models found to schedule" }, { status: 404 });
    }

    let totalCreated = 0;
    let totalPauseDays = 0;
    const modelReports: any[] = [];

    // Parse starting day in German Time (Europe/Berlin)
    const nowGerman = getGermanDateParts(new Date());
    let baseStartGermanYear = nowGerman.year;
    let baseStartGermanMonth = nowGerman.month;
    let baseStartGermanDay = nowGerman.day;

    if (startDate) {
      const [sY, sM, sD] = startDate.split("-").map(Number);
      if (sY && sM && sD) {
        baseStartGermanYear = sY;
        baseStartGermanMonth = sM;
        baseStartGermanDay = sD;
      }
    } else if (nowGerman.hour >= 18) {
      // If past 18:00 German time today, start scheduling from tomorrow
      const tomorrowDate = new Date(Date.now() + 86400000);
      const tomorrowGerman = getGermanDateParts(tomorrowDate);
      baseStartGermanYear = tomorrowGerman.year;
      baseStartGermanMonth = tomorrowGerman.month;
      baseStartGermanDay = tomorrowGerman.day;
    }

    for (const model of modelsToPlan) {
      let modelStartYear = baseStartGermanYear;
      let modelStartMonth = baseStartGermanMonth;
      let modelStartDay = baseStartGermanDay;

      // If reset is requested: Clear prior unposted draft/scheduled posts for this model
      if (shouldReset) {
        const existingUnposted = await prisma.post.findMany({
          where: {
            modelId: model.id,
            status: { in: [PostStatus.SCHEDULED, PostStatus.PENDING, PostStatus.DRAFT] },
          },
          select: { id: true, assetId: true },
        });

        const assetIdsToRelease = existingUnposted
          .map((p) => p.assetId)
          .filter(Boolean) as string[];

        await prisma.$transaction([
          prisma.asset.updateMany({
            where: { id: { in: assetIdsToRelease } },
            data: { isUsed: false },
          }),
          prisma.post.deleteMany({
            where: {
              modelId: model.id,
              status: { in: [PostStatus.SCHEDULED, PostStatus.PENDING, PostStatus.DRAFT] },
            },
          }),
        ]);
      } else {
        // Mode "extend": keep existing scheduled posts and start after the latest scheduled post
        const lastScheduledPost = await prisma.post.findFirst({
          where: {
            modelId: model.id,
            status: { in: [PostStatus.SCHEDULED, PostStatus.PENDING] },
          },
          orderBy: { scheduledFor: "desc" },
        });

        if (lastScheduledPost && lastScheduledPost.scheduledFor) {
          const lastGerman = getGermanDateParts(new Date(lastScheduledPost.scheduledFor));
          const nextDayDate = new Date(createGermanDate(lastGerman.year, lastGerman.month, lastGerman.day, 12, 0).getTime() + 86400000);
          const nextGerman = getGermanDateParts(nextDayDate);
          modelStartYear = nextGerman.year;
          modelStartMonth = nextGerman.month;
          modelStartDay = nextGerman.day;
        }
      }

      // CRITICAL: Consumed / Published content must NEVER be included!
      // Collect ALL asset IDs referenced by ANY existing post (PUBLISHED, SCHEDULED, or PENDING)
      const allReferencedAssetIds = (
        await prisma.post.findMany({
          where: {
            modelId: model.id,
            assetId: { not: null },
          },
          select: { assetId: true },
        })
      )
        .map((p) => p.assetId)
        .filter(Boolean) as string[];

      // Available assets are strictly unused and not referenced by any post
      const availableAssets = await prisma.asset.findMany({
        where: {
          modelId: model.id,
          isUsed: false,
          id: { notIn: allReferencedAssetIds },
        },
        orderBy: { createdAt: "asc" },
      });

      if (availableAssets.length === 0) {
        modelReports.push({
          modelName: model.name,
          status: "Keine unbenutzten Assets vorhanden",
          created: 0,
        });
        continue;
      }

      let modelCreated = 0;
      let modelPauses = 0;
      let lastDayParts = getGermanDateParts(createGermanDate(modelStartYear, modelStartMonth, modelStartDay, 12, 0));

      // Enrich available assets with video duration
      const enrichedAssets = await Promise.all(
        availableAssets.map(async (asset) => {
          const isVideo = asset.type === "VIDEO";
          let durationFormatted: string | null = null;
          let durationSeconds: number | null = null;

          if (isVideo) {
            const durInfo = await getAssetVideoDuration({
              type: "VIDEO",
              notes: asset.notes,
              fileUrl: asset.fileUrl,
            });
            if (durInfo) {
              durationSeconds = durInfo.seconds;
              durationFormatted = durInfo.formatted;
            }
          }

          return {
            id: asset.id,
            title: asset.title,
            theme: asset.theme,
            notes: asset.notes,
            fileUrl: asset.fileUrl,
            type: asset.type,
            explicitLevel: asset.explicitLevel,
            tags: asset.tags,
            duration: durationSeconds,
            durationFormatted,
          };
        })
      );

      // Plan with xAI Grok using the model's exact persona & tonality
      const { generateGrokSchedule } = await import("@/lib/grok");
      const targetDays = Math.max(14, Math.ceil(enrichedAssets.length * 1.5));

      const grokRes = await generateGrokSchedule({
        modelName: model.name,
        channelTitle: model.channelTitle,
        targetDays,
        strategy: "REALISTIC",
        allowPauseDays: true,
        modelTone: model.persona || "Playful, alluring, authentic German VIP creator",
        availableAssets: enrichedAssets,
      });

      for (const item of grokRes.schedule) {
        const [hour, minute] = item.timeOfDay.split(":").map(Number);
        const postDate = new Date(
          createGermanDate(modelStartYear, modelStartMonth, modelStartDay, hour || 14, minute || 30).getTime() +
          item.timeOffsetDays * 86400000
        );

        // If scheduled on Day 0 and already passed, roll to tomorrow
        const finalDate = postDate.getTime() <= Date.now()
          ? new Date(postDate.getTime() + 86400000)
          : postDate;

        const dateParts = getGermanDateParts(finalDate);
        lastDayParts = dateParts;

        await prisma.$transaction([
          prisma.post.create({
            data: {
              modelId: model.id,
              assetId: item.assetId,
              caption: item.caption,
              starsPrice: item.starsPrice,
              scheduledFor: finalDate,
              status: PostStatus.SCHEDULED,
            },
          }),
          prisma.asset.update({
            where: { id: item.assetId },
            data: { isUsed: true },
          }),
        ]);

        modelCreated++;
        totalCreated++;
      }

      modelPauses = grokRes.stats?.pauseDays || 0;

      totalPauseDays += modelPauses;
      modelReports.push({
        modelName: model.name,
        created: modelCreated,
        pauseDays: modelPauses,
        mode: shouldReset ? "regenerate" : "extend",
        plannedUntil: `${lastDayParts.year}-${String(lastDayParts.month).padStart(2, "0")}-${String(lastDayParts.day).padStart(2, "0")}`,
      });
    }

    const modeLabel = shouldReset ? "komplett neu generiert" : "mit neuem Content erweitert";
    return NextResponse.json({
      success: true,
      totalScheduled: totalCreated,
      totalPauseDays,
      mode: shouldReset ? "regenerate" : "extend",
      reports: modelReports,
      message: `Intelligenter Zeitplan ${modeLabel}: ${totalCreated} Postings aufgeteilt (verbrauchte Inhalte ausgeschlossen).`,
    });
  } catch (error: any) {
    console.error("Error generating auto-plan:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
