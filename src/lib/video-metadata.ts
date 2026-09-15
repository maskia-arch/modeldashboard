import fs from "fs";
import path from "path";
import { getAssetLocalPath } from "./assets";

export interface VideoDurationInfo {
  seconds: number;
  formatted: string;
  isShortClip: boolean; // < 45 seconds
  isLongVideo: boolean; // >= 90 seconds
}

/**
 * Formats duration in seconds to a human-readable German string.
 * e.g. 45 -> "45 Sekunden"
 * e.g. 135 -> "2 Min. 15 Sek."
 */
export function formatDurationGerman(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} Sekunden`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (secs === 0) {
    return `${mins} Minute${mins > 1 ? "n" : ""}`;
  }
  return `${mins} Min. ${secs} Sek.`;
}

/**
 * Parses an MP4 or QuickTime (MOV) buffer to find the `mvhd` (Movie Header) atom
 * and calculate the exact duration in seconds without any external dependencies.
 */
export function extractMp4DurationFromBuffer(buffer: Buffer): number | null {
  try {
    const mvhdSignature = Buffer.from("mvhd");
    let searchPos = 0;

    // Search within the first 256KB or buffer length
    const maxSearch = Math.min(buffer.length, 256 * 1024);

    while (searchPos < maxSearch - 24) {
      const idx = buffer.indexOf(mvhdSignature, searchPos);
      if (idx === -1 || idx > maxSearch - 24) break;

      // mvhd format:
      // [4 bytes atom size][4 bytes 'mvhd'][1 byte version][3 bytes flags]
      const version = buffer.readUInt8(idx + 4);

      if (version === 0 && idx + 4 + 16 <= buffer.length) {
        // Version 0: 32-bit timescale & duration
        // [1 byte ver][3 bytes flags][4 bytes creation][4 bytes mod]
        // timescale at offset +12, duration at offset +16
        const timescale = buffer.readUInt32BE(idx + 4 + 8);
        const duration = buffer.readUInt32BE(idx + 4 + 12);

        if (timescale > 0 && duration > 0) {
          const secs = Math.round(duration / timescale);
          if (secs > 0 && secs < 86400) return secs;
        }
      } else if (version === 1 && idx + 4 + 28 <= buffer.length) {
        // Version 1: 64-bit creation, mod, duration
        // timescale at offset +20 (32-bit), duration at offset +24 (64-bit)
        const timescale = buffer.readUInt32BE(idx + 4 + 16);
        const durationBig = buffer.readBigUInt64BE(idx + 4 + 20);
        const duration = Number(durationBig);

        if (timescale > 0 && duration > 0) {
          const secs = Math.round(duration / timescale);
          if (secs > 0 && secs < 86400) return secs;
        }
      }

      searchPos = idx + 4;
    }
  } catch (err) {
    // Graceful fallback on parse error
  }
  return null;
}

/**
 * Reads the first 128KB of a local video file on disk and extracts its duration.
 */
export async function extractMp4DurationFromFile(filePath: string): Promise<number | null> {
  let fd: fs.promises.FileHandle | null = null;
  try {
    if (!fs.existsSync(filePath)) return null;

    fd = await fs.promises.open(filePath, "r");
    const stat = await fd.stat();
    if (stat.size === 0) return null;

    // Read initial 128KB
    const readLength = Math.min(stat.size, 128 * 1024);
    const buffer = Buffer.alloc(readLength);
    await fd.read(buffer, 0, readLength, 0);

    const duration = extractMp4DurationFromBuffer(buffer);
    if (duration !== null) return duration;

    // If moov atom is at the end of the file (common in some MP4s), check last 128KB
    if (stat.size > 256 * 1024) {
      const tailOffset = stat.size - 128 * 1024;
      const tailBuffer = Buffer.alloc(128 * 1024);
      await fd.read(tailBuffer, 0, 128 * 1024, tailOffset);
      const tailDuration = extractMp4DurationFromBuffer(tailBuffer);
      if (tailDuration !== null) return tailDuration;
    }
  } catch {
    // Ignore and fallback
  } finally {
    if (fd) await fd.close().catch(() => {});
  }
  return null;
}

/**
 * Resolves the video duration for an asset:
 * 1. Inspects `asset.notes` for [DURATION: ...s] tags.
 * 2. If not found and local file exists, reads MP4 container header.
 */
export async function getAssetVideoDuration(asset: {
  type?: string | null;
  notes?: string | null;
  fileUrl?: string | null;
}): Promise<VideoDurationInfo | null> {
  if (asset.type !== "VIDEO") return null;

  let durationSec: number | null = null;

  // 1. Check notes for [DURATION: X] or [DURATION: Xs]
  if (asset.notes) {
    const match = asset.notes.match(/\[DURATION:\s*(\d+)s?\]/i);
    if (match && match[1]) {
      durationSec = parseInt(match[1], 10);
    } else {
      const dauerMatch = asset.notes.match(/(?:Dauer|Länge):\s*(\d+)\s*(?:Sek|s\b)/i);
      if (dauerMatch && dauerMatch[1]) {
        durationSec = parseInt(dauerMatch[1], 10);
      }
    }
  }

  // 2. Check local file if not found in notes
  if (!durationSec && asset.fileUrl) {
    const localPath = getAssetLocalPath(asset.fileUrl);
    if (localPath) {
      durationSec = await extractMp4DurationFromFile(localPath);
    }
  }

  if (durationSec && durationSec > 0) {
    return {
      seconds: durationSec,
      formatted: formatDurationGerman(durationSec),
      isShortClip: durationSec < 45,
      isLongVideo: durationSec >= 90,
    };
  }

  return null;
}
