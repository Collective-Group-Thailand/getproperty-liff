import { describe, expect, it } from "vitest";

import { qrModules, qrPath } from "./qr";

/** The mock's Thai QR payload (Tag 30 bill payment, CRC) — the app draws what the API sends, unchanged. */
const PAYLOAD =
  "00020101021230550016A00000067701011201150105550000001010212INV202600042530376454075856.005802TH6304D33F";

describe("Thai QR drawing", () => {
  it("encodes the payload as a square symbol with a 4-module quiet zone and finder patterns", () => {
    const modules = qrModules(PAYLOAD);
    const size = modules.length;
    expect(modules.every((row) => row.length === size)).toBe(true);
    // Version ≥ 4 for ~100 bytes at ECC M: 33 modules + 2 × 4 border.
    expect(size).toBeGreaterThanOrEqual(41);
    // Quiet zone light, finder pattern corners dark (top-left, top-right, bottom-left).
    expect(modules[0]!.some(Boolean)).toBe(false);
    expect(modules[4]![4]).toBe(true);
    expect(modules[4]![size - 5]).toBe(true);
    expect(modules[size - 5]![4]).toBe(true);
  });

  it("is deterministic, and the SVG path has one square per dark module", () => {
    const modules = qrModules(PAYLOAD);
    expect(qrModules(PAYLOAD)).toEqual(modules);
    const dark = modules.flat().filter(Boolean).length;
    expect(qrPath(modules).match(/M/g)).toHaveLength(dark);
  });
});
