import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getAssetLocalPath, isPhotoExtension } from "@/lib/assets";
import { classifyImageWithGrokVision } from "@/lib/grok";

export const dynamic = "force-dynamic";

/**
 * POST /api/assets/[id]/classify:
 * Triggers Grok 4.1 Vision classification on an existing photo.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const asset = await prisma.asset.findUnique({
      where: { id: params.id },
      include: { model: true },
    });

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    if (!asset.fileUrl) {
      return NextResponse.json({ error: "Asset has no associated file" }, { status: 400 });
    }

    const { isVideoOrGifExtension } = await import("@/lib/assets");
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
      try {
        const { restoreAssetMediaFile } = await import("@/lib/model-sources");
        const restorePromise = restoreAssetMediaFile(asset.id);
        const timeoutPromise = new Promise<{ success: boolean; filePath?: string; error?: string }>((resolve) =>
          setTimeout(() => resolve({ success: false, error: "Telegram restore timeout" }), 20000)
        );
        const restored = await Promise.race([restorePromise, timeoutPromise]);
        if (restored.success && restored.filePath) {
          localPath = restored.filePath;
        }
      } catch (rErr: any) {
        console.warn(`[Classify] Telegram restore error for asset ${asset.id}:`, rErr.message);
      }
    }

    // For videos: resolve or download video thumbnail for Grok Vision preview
    let visionFilePath = localPath;
    if (isVideo) {
      const { getOrCreateVideoThumbnail } = await import("@/lib/video-thumbnails");
      const thumbInfo = await getOrCreateVideoThumbnail({
        id: asset.id,
        fileUrl: asset.fileUrl,
        notes: asset.notes,
        tags: asset.tags,
        modelId: asset.modelId,
        model: asset.model,
      });
      visionFilePath = thumbInfo.thumbnailPath;
    }

    if (!visionFilePath) {
      return NextResponse.json({ error: "Datei konnte auf der Festplatte nicht gefunden oder wiederhergestellt werden." }, { status: 404 });
    }

    let classification;
    try {
      classification = await classifyImageWithGrokVision({
        localFilePath: visionFilePath,
        modelName: asset.model.name,
        isVideo,
        videoDurationSeconds: durationSeconds || undefined,
        videoDurationFormatted: durationFormatted || undefined,
      });
    } catch (grokErr: any) {
      console.warn(
        `[Classify] Grok Vision error for asset ${asset.id}: ${grokErr.message}. Applying resilient fallback classification.`
      );
      const { generateFallbackClassification } = await import("@/lib/grok");
      classification = generateFallbackClassification(
        visionFilePath,
        asset.model.name,
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

    const updated = await prisma.asset.update({
      where: { id: asset.id },
      data: {
        title: classification.title,
        theme: classification.theme,
        explicitLevel: classification.explicitLevel,
        tags: combinedTags,
        notes: `${classification.notes} | Caption: "${classification.suggestedCaption}" | Stars: ${classification.suggestedStarsPrice}`,
      },
    });

    return NextResponse.json({
      success: true,
      asset: updated,
      classification,
    });
  } catch (error: any) {
    console.error("Classification error:", error);
    return NextResponse.json({ error: error.message || "Classification failed" }, { status: 500 });
  }
}

/**
 * PATCH /api/assets/[id]/classify:
 * Manually updates classification metadata (specifically for Videos, GIFs, or overrides).
 */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const { title, theme, explicitLevel, tags, notes } = body;

    const updated = await prisma.asset.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(theme !== undefined && { theme }),
        ...(explicitLevel !== undefined && { explicitLevel }),
        ...(tags !== undefined && { tags }),
        ...(notes !== undefined && { notes }),
      },
    });

    return NextResponse.json({
      success: true,
      asset: updated,
    });
  } catch (error: any) {
    console.error("Manual classification update error:", error);
    return NextResponse.json({ error: error.message || "Failed to update asset" }, { status: 500 });
  }
}
