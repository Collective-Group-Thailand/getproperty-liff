"use client";

import { bffJson, CSRF_HEADERS } from "@/lib/api/browser";
import type { UploadPresign } from "@/lib/api/contract-requests";
import { problemFromResponse } from "@/lib/api/problem";
import { compressImage } from "@/ui/lib/image";

/**
 * Uploads one photo by presigned URL (master plan §4: photos go to object storage, never through the BFF) and
 * returns its file id. `CameraCapture` already compressed it on the phone; `compressImage` (`src/ui/lib/image.ts`)
 * leaves a photo that fits alone and only re-encodes one that does not. CONTRACT-REQUEST #9: `POST /v1/resident/uploads` is not in the contract yet. The mock
 * build's upload target is the BFF itself, which needs the CSRF header; object storage must not get it.
 */
export async function uploadPhoto(file: Blob): Promise<string> {
  const photo = await compressImage(file).catch(() => file);
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
