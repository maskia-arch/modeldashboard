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
): Promise<{ fileUrl: string; filePath: string; fileName: string; size: number }> {
  const dir = getUploadsDirectory(modelSlug);
  const ext = path.extname(originalFilename).toLowerCase();
  const baseName = path.basename(originalFilename, ext).replace(/[^a-zA-Z0-9_-]/g, "_");
  const uniqueName = `${Date.now()}_${Math.floor(Math.random() * 10000)}_${baseName}${ext}`;
  const filePath = path.join(dir, uniqueName);

  // Write primary file
  await fs.promises.writeFile(filePath, buffer);

  // Secondary dual-write to root /uploads to ensure persistence across any volume configuration
  try {
    const secondaryDir = path.join(process.cwd(), "uploads", "models", sanitizeSlug(modelSlug));
    if (!fs.existsSync(secondaryDir)) {
      fs.mkdirSync(secondaryDir, { recursive: true });
    }
    await fs.promises.writeFile(path.join(secondaryDir, uniqueName), buffer);
  } catch {}

  const stat = await fs.promises.stat(filePath);
  if (stat.size === 0) {
    throw new Error(`Written file was 0 bytes: ${filePath}`);
  }

  const cleanSlug = sanitizeSlug(modelSlug);
  const fileUrl = `/uploads/models/${cleanSlug}/${uniqueName}`;

  return {
    fileUrl,
    filePath,
    fileName: uniqueName,
    size: stat.size,
  };
}

/**
 * Resolves a fileUrl (e.g. /uploads/models/mausi/pic.jpg or /api/media/models/mausi/pic.jpg) to its absolute local disk path.
 */
export function getAssetLocalPath(fileUrl?: string | null): string | null {
  if (!fileUrl) return null;

  const cleanUrl = fileUrl.replace(/^\/api\/media\//, "/uploads/");

  // Only manage files located under /uploads/
  if (cleanUrl.startsWith("/uploads/")) {
    const relativePath = cleanUrl.startsWith("/") ? cleanUrl.slice(1) : cleanUrl;
    const candidates = [
      path.join(process.cwd(), "public", relativePath),
      path.join(process.cwd(), relativePath),
      path.join(process.cwd(), ".next", "standalone", "public", relativePath),
      path.join(process.cwd(), ".next", "standalone", relativePath),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
  }

  // If already absolute and exists
  if (path.isAbsolute(fileUrl) && fs.existsSync(fileUrl)) {
    return fileUrl;
  }

  return null;
}

export { getMediaDisplayUrl } from "./utils";

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

const CLASSIFICATION_TAG_WORDS = new Set([
  "teaser",
  "soft",
  "ppv",
  "lingerie",
  "dessous",
  "booty",
  "ass",
  "tits",
  "pussy",
  "topless",
  "nude",
  "explicit",
  "creator",
  "casuallifestyle",
  "casual",
  "lifestyle",
  "face",
  "portrait",
  "selfie",
  "unclassified",
  "spitze",
  "bett",
  "spiegel",
  "vip",
]);

/**
 * Strips obsolete or previous classification tags and merges with freshly verified tags.
 * Preserves structural tags like source identifiers (#quelle, #telegram, model name).
 */
export function mergeCleanedTags(existingTags: string[] = [], newTags: string[] = []): string[] {
  const preservedMetaTags = existingTags.filter(
    (t) => !CLASSIFICATION_TAG_WORDS.has(t.toLowerCase())
  );
  return Array.from(new Set([...preservedMetaTags, ...newTags.map((t) => t.toLowerCase())]));
}
