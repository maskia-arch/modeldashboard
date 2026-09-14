import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { getAssetLocalPath } from "@/lib/assets";
import { restoreAssetMediaFile } from "@/lib/model-sources";

export const dynamic = "force-dynamic";

/**
 * GET /api/assets/[id]/preview
 * Delivers asset media directly from disk or restores missing media on-demand from Telegram.
 * Completely immune to Next.js static asset shadowing and missing container files.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const assetId = params.id;
    if (!assetId) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const asset = await prisma.asset.findUnique({
      where: { id: assetId },
      include: { model: true },
    });

    if (!asset) {
      return new NextResponse("Asset Not Found", { status: 404 });
    }

    const forceReload = request.nextUrl.searchParams.get("reload") === "1";

    let localPath = !forceReload ? getAssetLocalPath(asset.fileUrl) : null;

    // If file missing on disk or reload forced, attempt automatic self-healing restoration
    if (!localPath || !fs.existsSync(localPath)) {
      console.log(`[AssetPreview] File for asset ${assetId} (${asset.title || "Untitled"}) missing on disk. Restoring...`);
      const restored = await restoreAssetMediaFile(assetId);
      if (restored.success && restored.filePath && fs.existsSync(restored.filePath)) {
        localPath = restored.filePath;
      }
    }

    if (!localPath || !fs.existsSync(localPath)) {
      console.warn(`[AssetPreview] Media could not be found or restored for asset ${assetId}`);
      // Return a clean inline SVG placeholder to prevent ugly broken image browser icons
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300">
        <rect width="300" height="300" fill="#111827"/>
        <circle cx="150" cy="130" r="36" fill="#374151"/>
        <text x="150" y="136" text-anchor="middle" fill="#9ca3af" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="bold">${asset.type === "VIDEO" ? "🎬 VIDEO" : "📷 FOTO"}</text>
        <text x="150" y="195" text-anchor="middle" fill="#d1d5db" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600">${asset.title || "Medium"}</text>
        <text x="150" y="218" text-anchor="middle" fill="#6b7280" font-family="system-ui, -apple-system, sans-serif" font-size="11">Wird synchronisiert...</text>
      </svg>`;
      return new NextResponse(svg, {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "no-cache",
        },
      });
    }

    const stat = await fs.promises.stat(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".webm": "video/webm",
      ".mkv": "video/x-matroska",
    };
    const contentType = mimeMap[ext] || "application/octet-stream";

    // Handle range requests for videos
    const rangeHeader = request.headers.get("range");
    if (rangeHeader && (contentType.startsWith("video/") || contentType.startsWith("audio/"))) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunksize = end - start + 1;

      const fileStream = fs.createReadStream(localPath, { start, end });
      const stream = new ReadableStream({
        start(controller) {
          fileStream.on("data", (chunk) => controller.enqueue(chunk));
          fileStream.on("end", () => controller.close());
          fileStream.on("error", (err) => controller.error(err));
        },
      });

      return new NextResponse(stream as any, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunksize.toString(),
          "Content-Type": contentType,
        },
      });
    }

    const buffer = await fs.promises.readFile(localPath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch (error: any) {
    console.error("[AssetPreview] Error serving asset preview:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
