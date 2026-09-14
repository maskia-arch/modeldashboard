import fs from "fs";
import path from "path";

/**
 * Normalizes model slug for filesystem directory naming.
 */
export function sanitizeSlug(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

/**
 * Returns the absolute base directory where uploads are stored:
 * public/uploads/models/[slug]
 */
export function getUploadsDirectory(modelSlug: string): string {
  const cleanSlug = sanitizeSlug(modelSlug);
  const dir = path.join(process.cwd(), "public", "uploads", "models", cleanSlug);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Saves a file buffer to disk and returns the public fileUrl and absolute filePath.
 */
export async function saveUploadedBuffer(
  buffer: Buffer,
  originalFilename: string,
  modelSlug: string
): Promise<{ fileUrl: string; filePath: string; fileName: string }> {
  const dir = getUploadsDirectory(modelSlug);
  const ext = path.extname(originalFilename).toLowerCase();
  const baseName = path.basename(originalFilename, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
  const uniqueName = `${Date.now()}_${Math.floor(Math.random() * 10000)}_${baseName}${ext}`;
  const filePath = path.join(dir, uniqueName);

  await fs.promises.writeFile(filePath, buffer);

  const cleanSlug = sanitizeSlug(modelSlug);
  const fileUrl = `/uploads/models/${cleanSlug}/${uniqueName}`;

  return {
    fileUrl,
    filePath,
    fileName: uniqueName,
  };
}

/**
 * Resolves a fileUrl (e.g. /uploads/models/mausi/pic.jpg) to its absolute local disk path.
 */
export function getAssetLocalPath(fileUrl?: string | null): string | null {
  if (!fileUrl) return null;

  // Only manage files located under /uploads/
  if (fileUrl.startsWith("/uploads/")) {
    const relativePath = fileUrl.startsWith("/") ? fileUrl.slice(1) : fileUrl;
    const fullPath = path.join(process.cwd(), "public", relativePath);
    return fs.existsSync(fullPath) ? fullPath : null;
  }

  // If already absolute and exists
  if (path.isAbsolute(fileUrl) && fs.existsSync(fileUrl)) {
    return fileUrl;
  }

  return null;
}

/**
 * Deletes a media file from the local hard drive to avoid duplicates and free storage.
 */
export async function deleteAssetLocalFile(fileUrl?: string | null): Promise<boolean> {
  if (!fileUrl) return false;

  try {
    const localPath = getAssetLocalPath(fileUrl);
    if (localPath && fs.existsSync(localPath)) {
      await fs.promises.unlink(localPath);
      console.log(`[AssetStorage] Successfully deleted consumed file from disk: ${localPath}`);
      return true;
    }
  } catch (error) {
    console.error(`[AssetStorage] Failed to delete file from disk: ${fileUrl}`, error);
  }

  return false;
}

/**
 * Determines whether a file extension belongs to a photo that can be inspected by Grok Vision.
 */
export function isPhotoExtension(filenameOrUrl: string): boolean {
  const ext = path.extname(filenameOrUrl).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp"].includes(ext);
}

/**
 * Determines whether a file extension belongs to a video or GIF (which must NOT be sent to Grok).
 */
export function isVideoOrGifExtension(filenameOrUrl: string): boolean {
  const ext = path.extname(filenameOrUrl).toLowerCase();
  return [".mp4", ".mov", ".mkv", ".avi", ".gif"].includes(ext);
}
