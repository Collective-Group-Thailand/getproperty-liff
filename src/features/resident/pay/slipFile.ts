"use client";

import type { SlipMimeType } from "@/lib/api/types";
import { compressImage } from "@/ui/lib/image";

/**
 * A transfer slip before it goes to `POST /v1/resident/invoices/{id}/slips` (D-043): the API takes the image or
 * PDF inline as base64, ≤ 5 MB. A bank app's screenshot is sent **as it is** whenever it fits — the verifier reads
 * the slip's own QR and text, and re-encoding a small PNG only loses detail. Only a large photo (a paper slip shot
 * with the camera, a 12-megapixel picture from the gallery) is scaled down on the phone, and a picture in a format
 * the API does not take (HEIC) is converted to JPEG.
 */
export const SLIP_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf";
const SENT_AS_IS: ReadonlySet<string> = new Set<SlipMimeType>(["image/jpeg", "image/png", "image/webp"]);
/** Raw bytes; base64 adds a third, which keeps the body under the API's 5 MB. */
export const SLIP_MAX_BYTES = 3_500_000;
/** Above this an image is scaled down before sending. */
export const SLIP_COMPRESS_ABOVE = 1_500_000;

export type PreparedSlip =
  { ok: true; blob: Blob; mimeType: SlipMimeType } | { ok: false; reason: "too_large" | "unsupported" };

export async function prepareSlip(file: Blob): Promise<PreparedSlip> {
  if (file.type === "application/pdf") {
    return file.size <= SLIP_MAX_BYTES
      ? { ok: true, blob: file, mimeType: "application/pdf" }
      : { ok: false, reason: "too_large" };
  }
  if (SENT_AS_IS.has(file.type) && file.size <= SLIP_COMPRESS_ABOVE) {
    return { ok: true, blob: file, mimeType: file.type as SlipMimeType };
  }
  if (!file.type.startsWith("image/")) return { ok: false, reason: "unsupported" };
  try {
    const blob = await compressImage(file, { maxDimension: 2048, maxBytes: 1_200_000, quality: 0.9, minQuality: 0.6 });
    return blob.size <= SLIP_MAX_BYTES
      ? { ok: true, blob, mimeType: "image/jpeg" }
      : { ok: false, reason: "too_large" };
  } catch {
    return { ok: false, reason: "unsupported" };
  }
}

/** The bytes as base64 (no `data:` prefix), as the contract's `format: byte` wants. */
export function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}
