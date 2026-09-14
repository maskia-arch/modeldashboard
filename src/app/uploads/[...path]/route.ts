import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

/**
 * GET /uploads/[...path]
 * Serves dynamic uploaded files (photos, videos, gifs) directly from disk.
 * Solves Next.js production 404 issue when files are created at runtime.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const pathParts = params.path;
    if (!pathParts || pathParts.length === 0) {
      return new NextResponse("Not Found", { status: 404 });
    }

    // Sanitize path parts
    const safeParts = pathParts.map((p) => path.basename(p));

    const possiblePaths = [
      path.join(process.cwd(), "public", "uploads", ...safeParts),
      path.join(process.cwd(), "uploads", ...safeParts),
      path.join(process.cwd(), ".next", "standalone", "public", "uploads", ...safeParts),
      path.join(process.cwd(), ".next", "standalone", "uploads", ...safeParts),
    ];

    let foundPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        foundPath = p;
        break;
      }
    }

    if (!foundPath) {
      console.warn("[UploadsRoute] File not found in candidates:", safeParts.join("/"));
      return new NextResponse("File Not Found", { status: 404 });
    }

    const stat = await fs.promises.stat(foundPath);
    if (!stat.isFile()) {
      return new NextResponse("Not a file", { status: 400 });
    }

    const ext = path.extname(foundPath).toLowerCase();
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

      const fileStream = fs.createReadStream(foundPath, { start, end });
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

    const buffer = await fs.promises.readFile(foundPath);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": stat.size.toString(),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error: any) {
    console.error("[UploadsRoute] Error serving upload:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
