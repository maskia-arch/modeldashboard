import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { deleteAssetLocalFile } from "@/lib/assets";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/assets/[id]:
 * Deletes an asset record from PostgreSQL and removes the local file from disk.
 */
export async function DELETE(
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
    });

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    // Delete file from disk if it was stored locally
    if (asset.fileUrl) {
      await deleteAssetLocalFile(asset.fileUrl);
    }

    await prisma.asset.delete({
      where: { id: asset.id },
    });

    return NextResponse.json({
      success: true,
      message: "Asset and file deleted from disk successfully.",
    });
  } catch (error: any) {
    console.error("Delete asset error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete asset" }, { status: 500 });
  }
}
