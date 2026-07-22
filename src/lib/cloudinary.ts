// @ts-nocheck
// Cloudinary Client-Side Direct Signed Upload Service
// Powered by browser Web Crypto API (SHA-1)

const CLOUD_NAME = "nvnjwvgz";
const API_KEY = "295574776626778";
const API_SECRET = "rFN2kIFbC3RDbR_FCh84P7s_9KA";
const FOLDER_NAME = "anova_anime";

/**
 * SHA-1 hashing helper using the browser's native SubtleCrypto.
 * No external packages required!
 */
async function sha1(str: string): Promise<string> {
  const buffer = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-1", buffer);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

import { dynamicUpload } from './storageManager';

/**
 * Uploads an image or video file (or a pasted URL) directly to Cloudinary using signed uploads.
 * Supports real-time upload progress callback.
 * Transparently routed through the Advanced Multi-Storage Management System.
 */
export async function uploadToCloudinary(
  fileOrUrl: File | string,
  resourceType: "image" | "video" = "image",
  onProgress?: (percent: number, details?: { speed?: string; sizeInfo?: string; eta?: string; processing?: boolean }) => void,
  metadata?: { animeTitle?: string; episodeNumber?: string | number; fileType?: string },
  signal?: AbortSignal
): Promise<string> {
  return dynamicUpload(fileOrUrl, resourceType, onProgress, metadata, signal);
}

