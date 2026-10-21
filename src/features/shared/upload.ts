"use client";

import { browserApi, CSRF_HEADERS, unwrap } from "@/lib/api/browser";
import { isNetworkFailure, networkError, problemFromResponse } from "@/lib/api/problem";
import type { UploadContentType, UploadPresign } from "@/lib/api/types";
import { compressImage } from "@/ui/lib/image";

/** What a resident photo is for, and the row it belongs to (the API checks both, D-203, B5.1). */
export type ResidentUploadTarget =
  { purpose: "deposit_dispute"; depositId: string } | { purpose: "service_request"; unitId: string };

const UPLOAD_TYPES: readonly UploadContentType[] = ["image/jpeg", "image/png", "image/webp"];

/** Hex SHA-256 of the bytes (every upload is hash-checked by the API's scan). */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * A photo ready to upload: compressed on the phone by `compressImage` (`src/ui/lib/image.ts` leaves one that already
 * fits and re-encodes the rest as JPEG), typed as one of the contract's content types, with its hash.
 */
export async function preparePhoto(
  file: Blob,
): Promise<{ photo: Blob; contentType: UploadContentType; sha256: string }> {
  const compressed = await compressImage(file).catch(() => file);
  const contentType = (UPLOAD_TYPES as readonly string[]).includes(compressed.type)
    ? (compressed.type as UploadContentType)
    : "image/jpeg";
  return { photo: compressed, contentType, sha256: await sha256Hex(compressed) };
}

/**
 * PUTs the bytes to the presigned URL (master plan §4: photos go to object storage, never through the BFF). The mock
 * build's upload target is the BFF itself, which needs the CSRF header; object storage must not get it.
 */
export async function putToPresigned(presign: Pick<UploadPresign, "uploadUrl" | "method" | "headers">, photo: Blob) {
  const sameOrigin = presign.uploadUrl.startsWith("/");
  let response: Response;
  try {
    response = await fetch(presign.uploadUrl, {
      method: presign.method,
      body: photo,
      headers: { "content-type": photo.type || "image/jpeg", ...presign.headers, ...(sameOrigin ? CSRF_HEADERS : {}) },
      credentials: sameOrigin ? "same-origin" : "omit",
    });
  } catch (caught) {
    throw isNetworkFailure(caught) ? networkError() : caught;
  }
  if (!response.ok) throw await problemFromResponse(response);
}

/**
 * Uploads one resident photo — `POST /v1/resident/uploads` (purpose, the row it belongs to, type, size, SHA-256) →
 * PUT to the 15-minute URL — and returns its file id for `photoDocumentIds`.
 */
export async function uploadResidentPhoto(file: Blob, target: ResidentUploadTarget): Promise<string> {
  const { photo, contentType, sha256 } = await preparePhoto(file);
  const presign = unwrap(
    await browserApi.POST("/v1/resident/uploads", {
      body: { ...target, contentType, sizeBytes: photo.size, sha256 },
    }),
  );
  await putToPresigned(presign, photo);
  return presign.fileId;
}

/**
 * Runs an upload with a light retry for flaky mobile data (L4 4.4 §2: "retry queue for photo uploads", not the staff
 * PWA's offline mode): up to `attempts` tries, waiting 1 s, 2 s, 4 s … between them. API problems other than 5xx /
 * 429 / network failures are not retried — the same request would be refused again.
 */
export async function withRetry<T>(
  task: () => Promise<T>,
  { attempts = 3, wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)) } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number } | null)?.status;
      const retryable = status === undefined || status === 0 || status === 429 || status >= 500;
      if (!retryable || attempt === attempts - 1) break;
      await wait(1000 * 2 ** attempt);
    }
  }
  throw lastError;
}
