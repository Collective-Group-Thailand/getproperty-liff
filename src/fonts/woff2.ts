import { brotliDecompressSync } from "node:zlib";

/**
 * The code points a WOFF2 font maps (its `cmap`), read without a font library: header → table directory → the one
 * Brotli stream → the `cmap` table (never transformed in WOFF2) → format 4 / 12 subtables. Used by the font-coverage
 * test (no tofu in my/km/lo/zh, L4 4.3); not shipped to the browser.
 */
const KNOWN_TAGS = [
  "cmap",
  "head",
  "hhea",
  "hmtx",
  "maxp",
  "name",
  "OS/2",
  "post",
  "cvt ",
  "fpgm",
  "glyf",
  "loca",
  "prep",
  "CFF ",
  "VORG",
  "EBDT",
  "EBLC",
  "gasp",
  "hdmx",
  "kern",
  "LTSH",
  "PCLT",
  "VDMX",
  "vhea",
  "vmtx",
  "BASE",
  "GDEF",
  "GPOS",
  "GSUB",
  "EBSC",
  "JSTF",
  "MATH",
  "CBDT",
  "CBLC",
  "COLR",
  "CPAL",
  "SVG ",
  "sbix",
  "acnt",
  "avar",
  "bdat",
  "bloc",
  "bsln",
  "cvar",
  "fdsc",
  "feat",
  "fmtx",
  "fvar",
  "gvar",
  "hsty",
  "just",
  "lcar",
  "mort",
  "morx",
  "opbd",
  "prop",
  "trak",
  "Zapf",
  "Silf",
  "Glat",
  "Gloc",
  "Feat",
  "Sill",
];

function base128(view: DataView, offset: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 5; i += 1) {
    const byte = view.getUint8(offset + i);
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return [value, offset + i + 1];
  }
  throw new Error("bad UIntBase128");
}

function tables(buffer: Buffer): Map<string, Buffer> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  if (buffer.toString("latin1", 0, 4) !== "wOF2") throw new Error("not a WOFF2 file");
  const numTables = view.getUint16(12);
  const compressedSize = view.getUint32(20);
  let offset = 48;
  const entries: { tag: string; length: number }[] = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = view.getUint8(offset);
    offset += 1;
    let tag: string;
    if ((flags & 0x3f) === 0x3f) {
      tag = buffer.toString("latin1", offset, offset + 4);
      offset += 4;
    } else tag = KNOWN_TAGS[flags & 0x3f]!;
    const version = (flags >> 6) & 3;
    let origLength: number;
    [origLength, offset] = base128(view, offset);
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    let length = origLength;
    if (transformed) [length, offset] = base128(view, offset);
    entries.push({ tag, length });
  }
  const stream = brotliDecompressSync(buffer.subarray(offset, offset + compressedSize));
  const out = new Map<string, Buffer>();
  let position = 0;
  for (const entry of entries) {
    out.set(entry.tag, stream.subarray(position, position + entry.length));
    position += entry.length;
  }
  return out;
}

/** The set of code points the font's best Unicode `cmap` subtable maps to a glyph. */
export function woff2CodePoints(buffer: Buffer): Set<number> {
  const cmap = tables(buffer).get("cmap");
  if (!cmap) throw new Error("no cmap table");
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength);
  const count = view.getUint16(2);
  const subtables: { platform: number; encoding: number; offset: number; format: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const platform = view.getUint16(4 + i * 8);
    const encoding = view.getUint16(6 + i * 8);
    const offset = view.getUint32(8 + i * 8);
    subtables.push({ platform, encoding, offset, format: view.getUint16(offset) });
  }
  const pick =
    subtables.find((s) => s.format === 12) ??
    subtables.find((s) => s.format === 4 && (s.platform === 3 || s.platform === 0));
  if (!pick) throw new Error("no Unicode cmap subtable");
  const points = new Set<number>();
  if (pick.format === 12) {
    const groups = view.getUint32(pick.offset + 12);
    for (let g = 0; g < groups; g += 1) {
      const base = pick.offset + 16 + g * 12;
      const start = view.getUint32(base);
      const end = view.getUint32(base + 4);
      for (let cp = start; cp <= end; cp += 1) points.add(cp);
    }
    return points;
  }
  const segX2 = view.getUint16(pick.offset + 6);
  const ends = pick.offset + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const rangeOffsets = deltas + segX2;
  for (let s = 0; s < segX2 / 2; s += 1) {
    const end = view.getUint16(ends + s * 2);
    const start = view.getUint16(starts + s * 2);
    const delta = view.getInt16(deltas + s * 2);
    const rangeOffset = view.getUint16(rangeOffsets + s * 2);
    for (let cp = start; cp <= end && cp !== 0xffff; cp += 1) {
      let glyph: number;
      if (rangeOffset === 0) glyph = (cp + delta) & 0xffff;
      else {
        const address = rangeOffsets + s * 2 + rangeOffset + (cp - start) * 2;
        glyph = view.getUint16(address);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) points.add(cp);
    }
  }
  return points;
}
