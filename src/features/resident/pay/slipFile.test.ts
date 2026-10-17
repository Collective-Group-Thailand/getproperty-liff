import { describe, expect, it, vi } from "vitest";

vi.mock("@/ui/lib/image", () => ({
  compressImage: vi.fn(
    async (file: Blob) => new Blob([new Uint8Array(Math.min(file.size, 900_000))], { type: "image/jpeg" }),
  ),
}));

import { compressImage } from "@/ui/lib/image";

import { prepareSlip, SLIP_MAX_BYTES, toBase64 } from "./slipFile";

const blob = (size: number, type: string) => new Blob([new Uint8Array(size)], { type });

describe("slip preparation (D-043)", () => {
  it("sends a bank app's screenshot as it is", async () => {
    const png = blob(200_000, "image/png");
    const prepared = await prepareSlip(png);
    expect(prepared).toEqual({ ok: true, blob: png, mimeType: "image/png" });
    expect(compressImage).not.toHaveBeenCalled();
  });

  it("scales a large photo down to JPEG and converts HEIC", async () => {
    expect(await prepareSlip(blob(6_000_000, "image/jpeg"))).toMatchObject({ ok: true, mimeType: "image/jpeg" });
    expect(await prepareSlip(blob(300_000, "image/heic"))).toMatchObject({ ok: true, mimeType: "image/jpeg" });
    expect(compressImage).toHaveBeenCalledTimes(2);
  });

  it("takes a PDF up to the limit, refuses larger ones and other files", async () => {
    expect(await prepareSlip(blob(1_000, "application/pdf"))).toMatchObject({ ok: true, mimeType: "application/pdf" });
    expect(await prepareSlip(blob(SLIP_MAX_BYTES + 1, "application/pdf"))).toEqual({ ok: false, reason: "too_large" });
    expect(await prepareSlip(blob(1_000, "text/plain"))).toEqual({ ok: false, reason: "unsupported" });
  });

  it("encodes base64 without the data: prefix", async () => {
    expect(await toBase64(new Blob(["slip"], { type: "image/png" }))).toBe(btoa("slip"));
  });
});
