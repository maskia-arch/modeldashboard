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
            type: "PHOTO",
            isUsed: false,
          },
        },
      },
    });

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    // Identify assets that need classification
    const unclassifiedAssets = model.assets.filter((a) => {
      const isUnclassifiedTag = a.tags?.includes("unclassified");
      const isQuelleGeneric =
        a.tags?.includes("quelle") &&
        (!a.theme || a.theme === "Allgemein" || a.theme === "Unklassifiziert" || a.title?.startsWith("Quell-Medium"));
      return isUnclassifiedTag || isQuelleGeneric;
    });

    if (unclassifiedAssets.length === 0) {
      return NextResponse.json({
        success: true,
        classifiedCount: 0,
        message: "Keine unklassifizierten Fotos gefunden.",
      });
    }

    let classifiedCount = 0;
    const errors: string[] = [];

    for (const asset of unclassifiedAssets) {
      if (!asset.fileUrl || !isPhotoExtension(asset.fileUrl)) continue;

      let localPath = getAssetLocalPath(asset.fileUrl);
      if (!localPath) {
        // Attempt automatic restoration from Telegram
        const restored = await restoreAssetMediaFile(asset.id);
        if (restored.success && restored.filePath) {
          localPath = restored.filePath;
        }
      }

      if (!localPath) {
        errors.push(`Datei nicht auf Festplatte gefunden für ${asset.title}`);
        continue;
      }

      try {
        const classification = await classifyImageWithGrokVision({
          localFilePath: localPath,
          modelName: model.name,
        });

        const cleanedTags = (asset.tags || []).filter((t: string) => t !== "unclassified");
        const combinedTags = Array.from(new Set([...cleanedTags, ...classification.tags]));

        await prisma.asset.update({
          where: { id: asset.id },
          data: {
            title: classification.title,
            theme: classification.theme,
            explicitLevel: classification.explicitLevel,
            tags: combinedTags,
            notes: `${asset.notes || ""} | Grok: ${classification.notes} | Caption: "${classification.suggestedCaption}" | Stars: ${classification.suggestedStarsPrice}`,
          },
        });

        classifiedCount++;
      } catch (err: any) {
        console.warn(`[ClassifyAll] Error classifying asset ${asset.id}:`, err.message);
        errors.push(err.message);
      }
    }

    return NextResponse.json({
      success: true,
      classifiedCount,
      totalFound: unclassifiedAssets.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `${classifiedCount} von ${unclassifiedAssets.length} Fotos erfolgreich mit Grok 4.1 Vision bewertet!`,
    });
  } catch (error: any) {
    console.error("[ClassifyAll] Batch classification error:", error);
    return NextResponse.json(
      { error: error.message || "Fehler bei der Batch-Klassifizierung" },
      { status: 500 }
    );
  }
}
