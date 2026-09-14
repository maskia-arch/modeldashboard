import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { syncMediaFromSourceChannel } from "@/lib/model-sources";

export const dynamic = "force-dynamic";

/**
 * POST /api/models/[slug]/source/sync:
 * Pulls media from the source channel via userbot and saves to disk.
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

    let limit = 50;
    try {
      const body = await req.json();
      if (body.limit && typeof body.limit === "number") {
        limit = Math.min(Math.max(body.limit, 5), 200);
      }
    } catch {}

    console.log(`[SourceSync] Triggering source channel media sync for ${model.name} (limit: ${limit})...`);
    const result = await syncMediaFromSourceChannel(model.id, limit);

    if (!result.success) {
      return NextResponse.json(
        { error: result.message || "Sync failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      importedCount: result.importedCount,
      message: result.message,
    });
  } catch (error: any) {
    console.error("[SourceSync] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to sync source channel" }, { status: 500 });
  }
}
