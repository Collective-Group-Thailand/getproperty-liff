/** The API takes a drawn signature as a PNG of at most 200 KB (`ResidentSignDto.signaturePng`, D-062). */
export const SIGNATURE_MAX_BYTES = 200 * 1024;

/**
 * Returns the PNG when it fits, else the same picture redrawn smaller (a photo of a signature from the upload
 * alternative is usually far larger than a drawing). `null` when even a small copy does not fit.
 */
export async function fitPng(png: Blob, maxBytes = SIGNATURE_MAX_BYTES): Promise<Blob | null> {
  if (png.size <= maxBytes) return png;
  if (typeof createImageBitmap === "undefined" || typeof document === "undefined") return null;
  const bitmap = await createImageBitmap(png);
  let width = bitmap.width;
  let height = bitmap.height;
  for (let tries = 0; tries < 6 && width > 160; tries += 1) {
    width = Math.round(width * 0.7);
    height = Math.round(height * 0.7);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
    const smaller = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (smaller && smaller.size <= maxBytes) return smaller;
  }
  return null;
}
