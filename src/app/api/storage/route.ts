import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getContentStorageStatus, cleanupStorageAndDuplicates } from "@/lib/storage";

export const dynamic = "force-dynamic";

/**
 * GET /api/storage:
 * Returns real-time disk utilization metrics for the 50 GB content pool.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const storage = await getContentStorageStatus();
    return NextResponse.json({ success: true, storage });
  } catch (error: any) {
    console.error("[StorageStatus] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to get storage metrics" }, { status: 500 });
  }
}

/**
 * POST /api/storage:
 * Cleans up used/posted content from disk and purges duplicate assets.
 */
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== "MASTER_ADMIN") {
      return NextResponse.json({ error: "Unauthorized. Only Master Admin can trigger storage optimization." }, { status: 403 });
    }

    let modelId: string | undefined = undefined;
    try {
      const body = await req.json();
      if (body.modelId) modelId = body.modelId;
    } catch {}

    const result = await cleanupStorageAndDuplicates(modelId);

    return NextResponse.json({
      success: true,
      ...result,
      message: `Speicher optimiert: ${result.usedCleanedCount} verbrauchte Dateien gelöscht, ${result.duplicatesRemovedCount} Duplikate entfernt. ${result.freedMb} MB Speicher freigegeben.`,
    });
  } catch (error: any) {
    console.error("[StorageCleanup] Error:", error);
    return NextResponse.json({ error: error.message || "Failed to cleanup storage" }, { status: 500 });
  }
}
