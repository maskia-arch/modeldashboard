import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { AssetType, ExplicitLevel } from "@prisma/client";
import { deleteAssetLocalFile } from "@/lib/assets";

export const dynamic = "force-dynamic";

export interface BatchAssetItem {
  type: "PHOTO" | "VIDEO" | "TEXT";
  explicitLevel: "TEASER" | "SOFT" | "PPV";
  theme: string;
  count: number;
  baseTitle?: string;
  notes?: string;
  referenceFolder?: string;
  tags?: string[];
}

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized. Only Master Admin can manage content inventory." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { modelId, items } = body as { modelId: string; items: BatchAssetItem[] };

    if (!modelId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "modelId and a non-empty items array are required" },
        { status: 400 }
      );
    }

    const createdAssets = [];

    for (const group of items) {
      const count = Math.max(1, Math.min(100, group.count || 1));
      const type = (group.type as AssetType) || AssetType.PHOTO;
      const explicitLevel = (group.explicitLevel as ExplicitLevel) || ExplicitLevel.TEASER;
      const theme = group.theme || "Allgemein";
      const baseTitle = group.baseTitle || `${theme} ${type === "PHOTO" ? "Foto" : "Video"}`;

      for (let i = 1; i <= count; i++) {
        const title = count > 1 ? `${baseTitle} #${i}` : baseTitle;
        const refUrl = group.referenceFolder
          ? `${group.referenceFolder.replace(/\/$/, "")}/${title.toLowerCase().replace(/\s+/g, "_")}.${type === "PHOTO" ? "jpg" : "mp4"}`
          : null;

        const asset = await prisma.asset.create({
          data: {
            modelId,
            title,
            theme,
            notes: group.notes || null,
            fileUrl: refUrl,
            type,
            explicitLevel,
            tags: Array.isArray(group.tags) ? group.tags : [theme.toLowerCase()],
          },
        });
        createdAssets.push(asset);
      }
    }

    return NextResponse.json({
      success: true,
      count: createdAssets.length,
      assets: createdAssets,
    }, { status: 201 });
  } catch (error: any) {
    console.error("Batch asset creation error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/assets/batch:
 * Deletes multiple assets from PostgreSQL and deletes their local files from disk.
 */
export async function DELETE(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized. Only Master Admin can delete content." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { assetIds } = body as { assetIds: string[] };

    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json(
        { error: "assetIds array is required and cannot be empty" },
        { status: 400 }
      );
    }

    // Find all matching assets to get their fileUrls
    const assets = await prisma.asset.findMany({
      where: { id: { in: assetIds } },
      select: { id: true, fileUrl: true },
    });

    if (assets.length === 0) {
      return NextResponse.json(
        { error: "No matching assets found" },
        { status: 404 }
      );
    }

    // 1. Delete physical files from disk
    const deletePromises = assets.map((a) => {
      if (a.fileUrl) {
        return deleteAssetLocalFile(a.fileUrl).catch((err) =>
          console.warn(`Failed to delete local file for asset ${a.id}:`, err)
        );
      }
      return Promise.resolve();
    });
    await Promise.all(deletePromises);

    const ids = assets.map((a) => a.id);

    // 2. Transactionally clean up DB references and delete assets
    await prisma.$transaction([
      // Delete draft/scheduled/pending posts
      prisma.post.deleteMany({
        where: {
          assetId: { in: ids },
          status: { in: ["DRAFT", "SCHEDULED", "PENDING"] },
        },
      }),
      // Unlink already published posts
      prisma.post.updateMany({
        where: {
          assetId: { in: ids },
        },
        data: {
          assetId: null,
        },
      }),
      // Delete assets
      prisma.asset.deleteMany({
        where: { id: { in: ids } },
      }),
    ]);

    return NextResponse.json({
      success: true,
      count: ids.length,
      message: `${ids.length} Medien und Dateien erfolgreich gelöscht.`,
    });
  } catch (error: any) {
    console.error("Batch asset delete error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete assets" }, { status: 500 });
  }
}

/**
 * PATCH /api/assets/batch:
 * Updates metadata (theme, explicitLevel, tags) for multiple assets in bulk.
 */
export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json(
        { error: "Unauthorized. Only Master Admin can update content." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { assetIds, theme, explicitLevel, addTags, removeTags } = body as {
      assetIds: string[];
      theme?: string;
      explicitLevel?: ExplicitLevel;
      addTags?: string[];
      removeTags?: string[];
    };

    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return NextResponse.json(
        { error: "assetIds array is required and cannot be empty" },
        { status: 400 }
      );
    }

    // Build update object
    const updateData: any = {};
    if (theme && typeof theme === "string" && theme.trim().length > 0) {
      updateData.theme = theme.trim();
    }
    if (explicitLevel && ["TEASER", "SOFT", "PPV"].includes(explicitLevel)) {
      updateData.explicitLevel = explicitLevel;
    }

    // If tag manipulation is required, we need to inspect each asset's tags
    if (
      (Array.isArray(addTags) && addTags.length > 0) ||
      (Array.isArray(removeTags) && removeTags.length > 0)
    ) {
      const assets = await prisma.asset.findMany({
        where: { id: { in: assetIds } },
        select: { id: true, tags: true },
      });

      const { mergeCleanedTags } = await import("@/lib/assets");

      const updatePromises = assets.map((asset) => {
        let currentTags = asset.tags || [];
        if (Array.isArray(removeTags) && removeTags.length > 0) {
          const toRemove = new Set(removeTags.map((t) => t.toLowerCase().trim()));
          currentTags = currentTags.filter((t) => !toRemove.has(t.toLowerCase().trim()));
        }
        if (Array.isArray(addTags) && addTags.length > 0) {
          currentTags = mergeCleanedTags(currentTags, addTags);
        }

        return prisma.asset.update({
          where: { id: asset.id },
          data: {
            ...updateData,
            tags: currentTags,
          },
        });
      });

      await prisma.$transaction(updatePromises);
    } else if (Object.keys(updateData).length > 0) {
      await prisma.asset.updateMany({
        where: { id: { in: assetIds } },
        data: updateData,
      });
    }

    return NextResponse.json({
      success: true,
      count: assetIds.length,
      message: `${assetIds.length} Medien erfolgreich aktualisiert.`,
    });
  } catch (error: any) {
    console.error("Batch asset update error:", error);
    return NextResponse.json({ error: error.message || "Failed to update assets" }, { status: 500 });
  }
}

