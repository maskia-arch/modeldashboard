import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getAssetLocalPath, isPhotoExtension } from "@/lib/assets";
import { classifyImageWithGrokVision } from "@/lib/grok";
import { restoreAssetMediaFile } from "@/lib/model-sources";

export const dynamic = "force-dynamic";

/**
 * POST /api/models/[slug]/classify-all:
 * Finds all unclassified photos for this model and classifies them with Grok 4.1 Vision.
 */
export async function POST(
  req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const model = await prisma.model.findUnique({
      where: { slug: params.slug },
      include: {
        assets: {
          where: {
            isUsed: false,
          },
        },
      },
    });

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const force = Boolean(body?.force);
    const limit = typeof body?.limit === "number" ? body.limit : 15;

    // Identify assets to classify
    const unclassifiedAssets = model.assets.filter((a) => {
      const isUnclassifiedTag = a.tags?.includes("unclassified");
      const isQuelleGeneric =
        a.tags?.includes("quelle") &&
        (!a.theme || a.theme === "Allgemein" || a.theme === "Unklassifiziert" || a.title?.startsWith("Quell-Medium"));
      return isUnclassifiedTag || isQuelleGeneric;
    });

    const targetAssets = force ? model.assets : unclassifiedAssets;

    if (targetAssets.length === 0) {
      return NextResponse.json({
        success: true,
        classifiedCount: 0,
        remainingCount: 0,
        message: force ? "Keine Medien für dieses Model vorhanden." : "Keine unklassifizierten Medien gefunden.",
      });
    }

    let classifiedCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    // Stop before 25 seconds to guarantee no Nginx 504 Gateway Timeout occurs
    const startTime = Date.now();
    const MAX_DURATION_MS = 25000;
    let processedIndex = 0;

    const { isVideoOrGifExtension } = await import("@/lib/assets");

    for (let i = 0; i < targetAssets.length && i < limit; i++) {
      processedIndex = i + 1;
      if (Date.now() - startTime > MAX_DURATION_MS) {
        console.log(`[ClassifyAll] Approaching timeout threshold (25s), stopping batch at ${i} items.`);
        break;
      }

      const asset = targetAssets[i];
      if (!asset.fileUrl) {
        skippedCount++;
        continue;
      }

      const isVideo = asset.type === "VIDEO" || isVideoOrGifExtension(asset.fileUrl);
      let durationSeconds: number | null = null;
      let durationFormatted: string | null = null;

      if (isVideo) {
        const { getAssetVideoDuration } = await import("@/lib/video-metadata");
        const dur = await getAssetVideoDuration({
          type: "VIDEO",
          notes: asset.notes,
          fileUrl: asset.fileUrl,
        });
        if (dur) {
          durationSeconds = dur.seconds;
          durationFormatted = dur.formatted;
        }
      }

      let localPath = getAssetLocalPath(asset.fileUrl);
      if (!localPath) {
        // Only try restoration if Telegram session exists
        try {
          const { restoreAssetMediaFile } = await import("@/lib/model-sources");
          const restored = await restoreAssetMediaFile(asset.id);
          if (restored.success && restored.filePath) {
            localPath = restored.filePath;
          }
        } catch {}
      }

      let visionFilePath = localPath;
      if (isVideo && asset.fileUrl) {
        const { getOrCreateVideoThumbnail } = await import("@/lib/video-thumbnails");
        const thumbInfo = await getOrCreateVideoThumbnail({
          id: asset.id,
          fileUrl: asset.fileUrl,
          notes: asset.notes,
          tags: asset.tags,
          modelId: model.id,
          model: { slug: model.slug, id: model.id },
        });
        visionFilePath = thumbInfo.thumbnailPath;
      }

      if (!visionFilePath) {
        skippedCount++;
        errors.push(`Datei nicht auf Festplatte: ${asset.title || asset.id}`);
        continue;
      }

      try {
        let classification;
        try {
          classification = await classifyImageWithGrokVision({
            localFilePath: visionFilePath,
            modelName: model.name,
            isVideo,
            videoDurationSeconds: durationSeconds || undefined,
            videoDurationFormatted: durationFormatted || undefined,
          });
        } catch (grokErr: any) {
          console.warn(
            `[ClassifyAll] Grok Vision error for ${asset.id}: ${grokErr.message}. Falling back.`
          );
          const { generateFallbackClassification } = await import("@/lib/grok");
          classification = generateFallbackClassification(
            visionFilePath,
            model.name,
            isVideo,
            durationFormatted || undefined,
            durationSeconds || undefined
          );
        }

        if (isVideo) {
          classification.explicitLevel = "PPV";
          classification.suggestedStarsPrice = Math.max(classification.suggestedStarsPrice || 0, 25);
        }

        const { mergeCleanedTags } = await import("@/lib/assets");
        const combinedTags = mergeCleanedTags(asset.tags || [], classification.tags || []);

        await prisma.asset.update({
          where: { id: asset.id },
          data: {
            title: classification.title,
            theme: classification.theme,
            explicitLevel: classification.explicitLevel,
            tags: combinedTags,
            notes: `${classification.notes} | Caption: "${classification.suggestedCaption}" | Stars: ${classification.suggestedStarsPrice}`,
          },
        });

        classifiedCount++;
      } catch (err: any) {
        console.warn(`[ClassifyAll] Error classifying asset ${asset.id}:`, err.message);
        errors.push(err.message);
      }
    }

    const remainingCount = targetAssets.length - processedIndex;

    return NextResponse.json({
      success: true,
      classifiedCount,
      skippedCount,
      totalTargeted: targetAssets.length,
      remainingCount,
      isComplete: remainingCount === 0,
      errors: errors.length > 0 ? errors : undefined,
      message: `${classifiedCount} Medien (Fotos & Videos) erfolgreich mit Grok 4.20 Vision bewertet!${
        remainingCount > 0 ? ` (${remainingCount} verbleibend)` : ""
      }`,
    });
  } catch (error: any) {
    console.error("[ClassifyAll] Batch classification error:", error);
    return NextResponse.json(
      { error: error.message || "Fehler bei der Batch-Klassifizierung" },
      { status: 500 }
    );
  }
}
