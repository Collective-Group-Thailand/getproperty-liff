"use client";

import { encode } from "uqr";

/**
 * The Thai QR (EMVCo, Tag 30) the API hands over as a payload string (D-042), drawn on the phone: never
 * re-encoded or altered here — the payload is the API's, byte for byte. ECC "M" with a 4-module quiet zone, the
 * level banking apps scan reliably from a screen or a saved picture.
 */
export function qrModules(payload: string): boolean[][] {
  return encode(payload, { ecc: "M", border: 4 }).data;
}

/** An SVG path of the dark modules (one `h1v1h-1z` square each) — the fallback where a canvas is unavailable. */
export function qrPath(modules: boolean[][]): string {
  let d = "";
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return d;
}

export interface QrPictureText {
  /** "฿5,856.00" */
  amount: string;
  /** "Ref. INV202600042" */
  reference: string;
  /** "Pay to บริษัท …" */
  payee?: string;
}

const SCALE = 10;
const FOOTER = 132;

/**
 * The QR as a PNG — what "save QR" stores and what the page shows, so a long press inside LINE saves a real
 * picture. With `text`, the amount, reference and payee are printed under it (a saved picture explains itself
 * in the photo gallery). `null` where the browser has no 2D canvas.
 */
export function qrCanvas(modules: boolean[][], text?: QrPictureText): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const size = modules.length * SCALE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size + (text ? FOOTER : 0);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000000";
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) context.fillRect(x * SCALE, y * SCALE, SCALE, SCALE);
    }),
  );
  if (text) {
    const font = getComputedStyle(document.body).fontFamily || "sans-serif";
    context.textAlign = "center";
    context.fillStyle = "#111111";
    context.font = `600 40px ${font}`;
    context.fillText(text.amount, size / 2, size + 44);
    context.font = `28px ${font}`;
    context.fillText(text.reference, size / 2, size + 84);
    if (text.payee) context.fillText(text.payee, size / 2, size + 120, size - 24);
  }
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png"));
}
