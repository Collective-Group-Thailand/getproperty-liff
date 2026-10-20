import { encode } from "uqr";

/**
 * A QR code as an SVG path, server-rendered (no client JavaScript): the parcel pick-up code the front desk scans
 * (D-212). ECC "M" with a 4-module quiet zone; one `h1v1h-1z` square per dark module.
 */
export function qrSvg(text: string): { size: number; path: string } {
  const modules = encode(text, { ecc: "M", border: 4 }).data;
  let path = "";
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return { size: modules.length, path };
}
