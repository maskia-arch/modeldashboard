import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { saveUploadedBuffer, isPhotoExtension, isVideoOrGifExtension } from "@/lib/assets";
import { classifyImageWithGrokVision } from "@/lib/grok";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized. Only Master Admin can upload content." },
        { status: 403 }
      );
    }

    const formData = await req.formData();
    const modelId = formData.get("modelId") as string;
    const autoClassifyStr = formData.get("autoClassify");
    const autoClassify = autoClassifyStr === "false" ? false : true;

    if (!modelId) {
      return NextResponse.json({ error: "modelId is required" }, { status: 400 });
    }

    const model = await prisma.model.findUnique({
      where: { id: modelId },
    });

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const files = formData.getAll("files") as File[];
    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided for upload" }, { status: 400 });
    }

    const createdAssets = [];
    let duplicatesSkipped = 0;

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const { fileUrl, filePath, hash } = await saveUploadedBuffer(buffer, file.name, model.slug);

      // Deduplication check: verify if identical content already exists for this model
      const { findDuplicateAsset } = await import("@/lib/storage");
      const existingDuplicate = await findDuplicateAsset(model.id, hash);

      if (existingDuplicate) {
        console.log(`[Upload] Duplicate file detected for ${file.name} (matches asset ${existingDuplicate.id}). Removing temporary file.`);
        const { deleteAssetLocalFile } = await import("@/lib/assets");
        await deleteAssetLocalFile(fileUrl);
        duplicatesSkipped++;
        continue;
      }

      const isPhoto = isPhotoExtension(file.name);
      const isVideoOrGif = isVideoOrGifExtension(file.name);
      const assetType = isPhoto ? "PHOTO" : "VIDEO";

      let title = file.name.replace(/\.[^/.]+$/, "");
      let theme = "Allgemein";
      let explicitLevel: "TEASER" | "SOFT" | "PPV" = "TEASER";
      let tags: string[] = ["upload", model.slug];
      let notes = isVideoOrGif ? "Manuell zu klassifizieren (Video/GIF)" : "Hochgeladen";

      // Grok 4.1 Vision: Only evaluate photos, strictly exclude videos and GIFs
      if (isPhoto && autoClassify) {
        try {
          const classification = await classifyImageWithGrokVision({
            localFilePath: filePath,
            modelName: model.name,
          });

          title = classification.title || title;
          theme = classification.theme || theme;
          explicitLevel = classification.explicitLevel || explicitLevel;
          tags = Array.from(new Set([...tags, ...(classification.tags || [])]));
          notes = `${classification.notes} | Caption: "${classification.suggestedCaption}" | Stars: ${classification.suggestedStarsPrice}`;
        } catch (visionErr: any) {
          console.warn(`Vision classification failed for ${file.name}:`, visionErr?.message || visionErr);
        }
      }

      // Attach content hash to notes for reliable duplicate detection
      notes = `${notes} | [HASH:${hash}]`.trim();

      const asset = await prisma.asset.create({
        data: {
          modelId: model.id,
          title,
          theme,
          notes,
          fileUrl,
          type: assetType,
          explicitLevel,
          tags,
          isUsed: false,
        },
      });

      createdAssets.push(asset);
    }

    let message = `${createdAssets.length} Medien erfolgreich auf Festplatte gespeichert!`;
    if (duplicatesSkipped > 0) {
      message += ` (${duplicatesSkipped} Duplikate erkannt und verworfen)`;
    }

    return NextResponse.json({
      success: true,
      assets: createdAssets,
      count: createdAssets.length,
      duplicatesSkipped,
      message,
    });
  } catch (error: any) {
    console.error("Content upload failed:", error);
    return NextResponse.json({ error: error.message || "Failed to upload content" }, { status: 500 });
  }
}
