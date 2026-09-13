import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AssetType, ExplicitLevel } from "@prisma/client";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get("modelId");

    const assets = await prisma.asset.findMany({
      where: modelId ? { modelId } : undefined,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(assets);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { modelId, title, theme, notes, fileUrl, type, explicitLevel, tags } = body;

    if (!modelId) {
      return NextResponse.json(
        { error: "modelId is required" },
        { status: 400 }
      );
    }

    const asset = await prisma.asset.create({
      data: {
        modelId,
        title: title || `${type || "PHOTO"} - ${explicitLevel || "TEASER"}`,
        theme: theme || null,
        notes: notes || null,
        fileUrl: fileUrl || null,
        type: (type as AssetType) || AssetType.PHOTO,
        explicitLevel: (explicitLevel as ExplicitLevel) || ExplicitLevel.TEASER,
        tags: Array.isArray(tags) ? tags : [],
      },
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (error: any) {
    console.error("Error creating asset:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
