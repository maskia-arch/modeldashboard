import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PostStatus, ExplicitLevel } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Master Admin access required." }, { status: 403 });
    }

    const body = await req.json();
    const { modelId, startDate } = body;

    const modelsToPlan = modelId && modelId !== "ALL"
      ? await prisma.model.findMany({ where: { id: modelId } })
      : await prisma.model.findMany();

    if (modelsToPlan.length === 0) {
      return NextResponse.json({ error: "No models found to schedule" }, { status: 404 });
    }

    let totalCreated = 0;
    let totalPauseDays = 0;
    const modelReports: any[] = [];

    // Parse starting day
    const baseStart = startDate ? new Date(startDate) : new Date();
    // Default start from tomorrow if past 18:00 today
    if (!startDate && baseStart.getHours() >= 18) {
      baseStart.setDate(baseStart.getDate() + 1);
    }
    baseStart.setHours(0, 0, 0, 0);

    for (const model of modelsToPlan) {
      // Find unused assets not yet linked to any future post
      const scheduledAssetIds = (
        await prisma.post.findMany({
          where: {
            modelId: model.id,
            status: { in: [PostStatus.SCHEDULED, PostStatus.PENDING] },
            assetId: { not: null },
          },
          select: { assetId: true },
        })
      )
        .map((p) => p.assetId)
        .filter(Boolean) as string[];

      const availableAssets = await prisma.asset.findMany({
        where: {
          modelId: model.id,
          isUsed: false,
          id: { notIn: scheduledAssetIds },
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

      // Determine pacing strategy based on inventory count:
      // - count <= 6: 1 post every 3 days (pause 2 days)
      // - count <= 12: 1 post every 2 days (pause 1 day)
      // - count <= 20: 1 post/day, with Sunday pause
      // - count > 20: 1 to 2 posts/day max (1 post on weekdays, 2 on Fri/Sat, Sunday optional pause)

      while (assetIndex < count) {
        const currentDate = new Date(baseStart);
        currentDate.setDate(currentDate.getDate() + dayOffset);
        const dayOfWeek = currentDate.getDay(); // 0 = Sun, 5 = Fri, 6 = Sat

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
          const postDate = new Date(currentDate);

          // Prime times:
          // Slot 0 (Afternoon): 14:30
          // Slot 1 (Evening): 20:15
          if (slot === 0 && postsToday === 2) {
            postDate.setHours(14, 30, 0, 0);
          } else {
            postDate.setHours(20, 15, 0, 0);
          }

          // Generate engaging natural VIP German caption
          let starsPrice = 0;
          let caption = "";

          const assetTheme = asset.theme || "VIP Exclusive";
          const assetTitle = asset.title || "Neuer exklusiver Drop";

          if (asset.explicitLevel === ExplicitLevel.PPV) {
            starsPrice = 50;
            caption = `🔥 **Privater VIP-Content freigeschaltet** 🔥\n\n${asset.notes || `${assetTheme} – Streng limitiert nur für euch!`}\n\n👇 Jetzt mit Telegram Stars entsperren:`;
          } else if (asset.explicitLevel === ExplicitLevel.SOFT) {
            starsPrice = 15;
            caption = `✨ *${assetTitle}* ✨\n\n${asset.notes || `Ein kleiner Vorgeschmack aus dem heutigen Shooting zum Thema ${assetTheme}. Wie gefällt es euch? Hinterlasst ein Like ❤️`}`;
          } else {
            starsPrice = 0;
            caption = `Hey ihr Lieben! 💕\n\n${asset.notes || `${assetTitle} aus der neuen ${assetTheme}-Reihe. Schreibt mir mal in die Kommentare, was ihr heute macht! 🥰`}`;
          }

          await prisma.post.create({
            data: {
              modelId: model.id,
              assetId: asset.id,
              caption,
              starsPrice,
              scheduledFor: postDate,
              status: PostStatus.SCHEDULED,
            },
          });

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
        plannedUntil: new Date(baseStart.getTime() + dayOffset * 86400000).toISOString().split("T")[0],
      });
    }

    return NextResponse.json({
      success: true,
      totalScheduled: totalCreated,
      totalPauseDays,
      reports: modelReports,
      message: `Intelligenter Zeitplan erstellt: ${totalCreated} Postings aufgeteilt (max. 1-2 pro Tag mit strategischen Pausentagen).`,
    });
  } catch (error: any) {
    console.error("Error generating auto-plan:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
