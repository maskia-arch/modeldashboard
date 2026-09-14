import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

export function formatStars(amount: number): string {
  return new Intl.NumberFormat("en-US").format(amount) + " ⭐️";
}

export function truncateAddress(address: string, chars = 6): string {
  if (!address) return "";
  if (address.length <= chars * 2) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Converts internal asset fileUrl or assetId to the optimal client-facing preview URL.
 * Automatically prefers dedicated API routes (/api/assets/[id]/preview or /api/media/...)
 * which are immune to Next.js static-directory shadowing and support on-demand self-healing.
 */
export function getMediaDisplayUrl(fileUrl?: string | null, assetId?: string): string {
  if (assetId) {
    return `/api/assets/${assetId}/preview`;
  }
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://") || fileUrl.startsWith("data:")) return fileUrl;
  if (fileUrl.startsWith("/uploads/")) {
    return `/api/media/${fileUrl.replace(/^\/uploads\//, "")}`;
  }
  if (fileUrl.startsWith("/api/media/")) return fileUrl;
  return fileUrl;
}

