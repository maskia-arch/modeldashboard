import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { startBackgroundSourceSync, getSourceSyncState } from "@/lib/model-sources";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/models/[slug]/source/sync:
 * Returns the current background synchronization progress and state.
 */
export async function GET(
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
      select: { id: true, name: true, slug: true },
    });

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    const state = getSourceSyncState(model.id);
    return NextResponse.json({
      success: true,
      state,
    });
  } catch (error: any) {
    console.error("[SourceSync] GET Error:", error);
    return NextResponse.json({ error: error.message || "Failed to get sync status" }, { status: 500 });
  }
}

/**
 * POST /api/models/[slug]/source/sync:
 * Triggers a non-blocking background synchronization task that streams media
 * directly to disk. Responds immediately (<15ms) to prevent proxy (520/504) timeouts.
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
      select: { id: true, name: true, slug: true },
    });

    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    let limit = 50;
    let classifyWithGrok = false;
    let offsetId: number | undefined = undefined;
    try {
      const body = await req.json();
      if (typeof body.limit === "number") {
        limit = body.limit === 0 ? 0 : Math.min(Math.max(body.limit, 1), 5000);
      }
      if (body.classifyWithGrok !== undefined) {
        classifyWithGrok = Boolean(body.classifyWithGrok);
      }
      if (typeof body.offsetId === "number" && body.offsetId > 0) {
        offsetId = body.offsetId;
      }
    } catch {}

    console.log(
      `[SourceSync] Starting background sync for ${model.name} (limit: ${limit === 0 ? "ALL" : limit}, offsetId: ${offsetId || "none"}, grok: ${classifyWithGrok})...`
    );

    const state = startBackgroundSourceSync(model.id, limit, classifyWithGrok, offsetId);

    return NextResponse.json({
      success: true,
      started: true,
      state,
    });
  } catch (error: any) {
    console.error("[SourceSync] POST Error:", error);
    return NextResponse.json({ error: error.message || "Failed to start sync" }, { status: 500 });
  }
}

