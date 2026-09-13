import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { AssetType, ExplicitLevel } from "@prisma/client";

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
