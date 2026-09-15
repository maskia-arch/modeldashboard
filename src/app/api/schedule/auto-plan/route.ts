import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PostStatus, ExplicitLevel } from "@prisma/client";
import { getGermanDateParts, createGermanDate } from "@/lib/timezone";
import { sanitizeCaptionForMediaType } from "@/lib/captions";

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

      const count = availableAssets.length;
      let dayOffset = 0;
      let assetIndex = 0;
      let modelCreated = 0;
      let modelPauses = 0;
      let lastDayParts = getGermanDateParts(createGermanDate(modelStartYear, modelStartMonth, modelStartDay, 12, 0));

      // Determine pacing strategy based on inventory count:
      // - count <= 6: 1 post every 3 days (pause 2 days)
      // - count <= 12: 1 post every 2 days (pause 1 day)
      // - count <= 20: 1 post/day, with Sunday pause
      // - count > 20: 1 to 2 posts/day max (1 post on weekdays, 2 on Fri/Sat, Sunday optional pause)

      while (assetIndex < count) {
        const currentTargetDate = new Date(createGermanDate(modelStartYear, modelStartMonth, modelStartDay, 12, 0).getTime() + dayOffset * 86400000);
        const currentDayParts = getGermanDateParts(currentTargetDate);
        lastDayParts = currentDayParts;
        const dayOfWeek = currentDayParts.dayOfWeek; // 0 = Sun, 5 = Fri, 6 = Sat

        // Decide if this day is a pause day
        let isPauseDay = false;

        if (count <= 6) {
          // Post on day 0, 3, 6, 9...
          isPauseDay = dayOffset % 3 !== 0;
        } else if (count <= 12) {
          // Post on day 0, 2, 4, 6...
          isPauseDay = dayOffset % 2 !== 0;
        } else if (count <= 20) {
          // Pause on Sundays
          isPauseDay = dayOfWeek === 0;
        }

        if (isPauseDay) {
          modelPauses++;
          dayOffset++;
          continue;
        }

        // Determine how many posts for today: 1 or 2 (NEVER more than 2!)
        let postsToday = 1;
        if (count > 20 && (dayOfWeek === 5 || dayOfWeek === 6) && (count - assetIndex) >= 2) {
          postsToday = 2;
        }

        for (let slot = 0; slot < postsToday && assetIndex < count; slot++) {
          const asset = availableAssets[assetIndex];

          // Prime times strictly in German Time (Europe/Berlin):
          // Slot 0 (Afternoon): 14:30 German time
          // Slot 1 (Evening): 20:15 German time
          const postDate = (slot === 0 && postsToday === 2)
            ? createGermanDate(currentDayParts.year, currentDayParts.month, currentDayParts.day, 14, 30)
            : createGermanDate(currentDayParts.year, currentDayParts.month, currentDayParts.day, 20, 15);

          // Generate engaging natural VIP German caption
          let starsPrice = 0;
          let caption = "";

          const assetTheme = asset.theme || "VIP Exclusive";
          const assetTitle = asset.title || "Neuer exklusiver Drop";

          const isVideo = asset.type === "VIDEO";
          if (asset.explicitLevel === ExplicitLevel.PPV) {
            starsPrice = 50;
            const itemLabel = isVideo ? "VIP-Clip" : "VIP-Foto";
            const unlockWord = isVideo ? "das Video" : "das Foto";
            caption = `🔥 **Privater ${itemLabel} freigeschaltet** 🔥\n\n${asset.notes || `${assetTheme} – Streng limitiert nur für euch!`}\n\n👇 Jetzt ${unlockWord} mit Telegram Stars entsperren:`;
          } else if (asset.explicitLevel === ExplicitLevel.SOFT) {
            starsPrice = 15;
            const formatWord = isVideo ? "dem heutigen Video-Set" : "dem heutigen Foto-Shooting";
            caption = `✨ *${assetTitle}* ✨\n\n${asset.notes || `Ein kleiner Vorgeschmack aus ${formatWord} zum Thema ${assetTheme}. Wie gefällt es euch? Hinterlasst ein Like ❤️`}`;
          } else {
            starsPrice = 0;
            caption = `Hey ihr Lieben! 💕\n\n${asset.notes || `${assetTitle} aus der neuen ${assetTheme}-Reihe. Schreibt mir mal in die Kommentare, was ihr heute macht! 🥰`}`;
          }

          // If Grok 4.1 Vision has classified this asset, use its custom generated caption & stars
          if (asset.notes && asset.notes.includes('Caption: "')) {
            const match = asset.notes.match(/Caption: "([^"]+)"/);
            if (match && match[1]) {
              caption = match[1];
            }
          }
          if (asset.notes && asset.notes.includes('Stars: ')) {
            const sMatch = asset.notes.match(/Stars:\s*(\d+)/);
            if (sMatch && sMatch[1]) {
              starsPrice = parseInt(sMatch[1], 10) || starsPrice;
            }
          }

          // Ensure strict format integrity: photo never mentions video/clip, video never mentions photo
          caption = sanitizeCaptionForMediaType(caption, asset.type);

          await prisma.$transaction([
            prisma.post.create({
              data: {
                modelId: model.id,
                assetId: asset.id,
                caption,
                starsPrice,
                scheduledFor: postDate,
                status: PostStatus.SCHEDULED,
              },
            }),
            prisma.asset.update({
              where: { id: asset.id },
              data: { isUsed: true },
            }),
          ]);

          modelCreated++;
          totalCreated++;
          assetIndex++;
        }

        dayOffset++;
      }

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
