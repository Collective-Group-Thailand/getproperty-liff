import { describe, expect, it } from "vitest";

import { fitPng, SIGNATURE_MAX_BYTES } from "./signatureImage";

describe("signature PNG size (ResidentSignDto.signaturePng ≤ 200 KB)", () => {
  it("passes a drawing that fits through untouched", async () => {
    const png = new Blob([new Uint8Array(1000)], { type: "image/png" });
    expect(await fitPng(png)).toBe(png);
    expect(SIGNATURE_MAX_BYTES).toBe(204_800);
  });

  it("refuses what it cannot shrink here (no canvas in this environment)", async () => {
    const big = new Blob([new Uint8Array(SIGNATURE_MAX_BYTES + 1)], { type: "image/png" });
    expect(await fitPng(big)).toBeNull();
  });
});
