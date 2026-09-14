import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { getModelSource, saveModelSource, deleteModelSource } from "@/lib/model-sources";

export const dynamic = "force-dynamic";

/**
 * GET /api/models/[slug]/source:
 * Returns the source channel configuration for the model.
 */
export async function GET(
  req: Request,
  { params }: { params: { slug: string } }
) {
  try {
    const model = await prisma.model.findUnique({
      where: { slug: params.slug },
    });

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const source = getModelSource(model.id);
    return NextResponse.json({
      success: true,
      source,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/models/[slug]/source:
 * Saves or updates the source channel configuration.
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
    });

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const body = await req.json();
    const { sourceChannelId, sourceChannelTitle } = body;

    if (!sourceChannelId) {
      deleteModelSource(model.id);
      return NextResponse.json({
        success: true,
        source: null,
        message: "Quell-Kanal erfolgreich entfernt.",
      });
    }

    const targetChannelId = String(sourceChannelId).trim();
    const existingConfig = getModelSource(model.id);
    const isSameChannel =
      existingConfig &&
      existingConfig.sourceChannelId &&
      existingConfig.sourceChannelId === targetChannelId;

    const saved = saveModelSource(model.id, {
      sourceChannelId: targetChannelId,
      sourceChannelTitle: sourceChannelTitle ? String(sourceChannelTitle).trim() : undefined,
    });

    const updateMsg = isSameChannel
      ? "Quellkanal als Update bestätigt (nur neuer Content wird beim Synchronisieren geladen)."
      : "Quellkanal erfolgreich gespeichert.";

    return NextResponse.json({
      success: true,
      source: saved,
      isUpdate: Boolean(isSameChannel),
      message: updateMsg,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
