"use client";

import { bffJson, CSRF_HEADERS } from "@/lib/api/browser";
import type { UploadPresign } from "@/lib/api/contract-requests";
import { problemFromResponse } from "@/lib/api/problem";

/** Photos are re-encoded on the phone before they leave it: long side ≤ 1600 px, JPEG, ≤ 240 KB when possible. */
export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_TARGET_BYTES = 240 * 1024;

export async function compressPhoto(file: Blob): Promise<Blob> {
  if (typeof createImageBitmap === "undefined" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  let width = Math.max(1, Math.round(bitmap.width * scale));
  let height = Math.max(1, Math.round(bitmap.height * scale));
  let best: Blob | null = null;
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) break;
    best = blob;
    if (blob.size <= PHOTO_TARGET_BYTES) return blob;
    width = Math.round(width * 0.8);
    height = Math.round(height * 0.8);
  }
  return best ?? file;
}

/**
 * Uploads one photo by presigned URL (master plan §4: photos go to object storage, never through the BFF) and
 * returns its file id. CONTRACT-REQUEST #9: `POST /v1/resident/uploads` is not in the contract yet. The mock
 * build's upload target is the BFF itself, which needs the CSRF header; object storage must not get it.
 */
export async function uploadPhoto(file: Blob): Promise<string> {
  const photo = await compressPhoto(file);
  const contentType = photo.type || "image/jpeg";
  // CONTRACT-REQUEST #9 (docs/contract-requests.md).
  const presign = await bffJson<UploadPresign>("/v1/resident/uploads", {
    method: "POST",
    body: { purpose: "deposit_dispute", contentType, sizeBytes: photo.size },
  });
  const sameOrigin = presign.uploadUrl.startsWith("/");
  const response = await fetch(presign.uploadUrl, {
    method: presign.method,
    body: photo,
    headers: { "content-type": contentType, ...presign.headers, ...(sameOrigin ? CSRF_HEADERS : {}) },
    credentials: sameOrigin ? "same-origin" : "omit",
  });
  if (!response.ok) throw await problemFromResponse(response);
  return presign.fileId;
}
