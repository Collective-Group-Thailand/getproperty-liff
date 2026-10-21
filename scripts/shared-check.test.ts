import { describe, expect, it } from "vitest";

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { compare, expandEntry, hasCopyHeader, parseManifest, stripCopyHeader } from "./shared-check";

const H = "// copied from getproperty-web@08ff63b until collective-shared exists (D-155)";

describe("parseManifest", () => {
  it("reads the table rows and ignores everything else", () => {
    const md = [
      "# Shared copies",
      "| Path | Mode | Source commit |",
      "|---|---|---|",
      "| `src/ui/components/Button.tsx` | verbatim | `08ff63b` |",
      "| `src/ui/theme/themes.ts` | adapted | `08ff63b` |",
      "| not a row | nonsense | x |",
    ].join("\n");
    expect(parseManifest(md)).toEqual([
      { path: "src/ui/components/Button.tsx", mode: "verbatim", commit: "08ff63b" },
      { path: "src/ui/theme/themes.ts", mode: "adapted", commit: "08ff63b" },
    ]);
  });

  it("reads a copy kept under another name (`copy ← source`)", () => {
    const md = "| `public/icons/icon-192.png` ← `public/pwa/staff-192.png` | binary | `79541bc` |";
    expect(parseManifest(md)).toEqual([
      { path: "public/icons/icon-192.png", source: "public/pwa/staff-192.png", mode: "binary", commit: "79541bc" },
    ]);
  });
});

describe("headers", () => {
  it("finds and strips the header in TS, CSS, Markdown and MDX", () => {
    expect(hasCopyHeader(`${H}\nexport const x = 1;\n`)).toBe(true);
    expect(stripCopyHeader(`${H}\nexport const x = 1;\n`)).toBe("export const x = 1;\n");
    const css = "/* copied from getproperty-web@08ff63b until collective-shared exists (D-155) */\na{}\n";
    expect(stripCopyHeader(css)).toBe("a{}\n");
    const mdx = 'import { Meta } from "x";\n\n{/* copied from getproperty-web@08ff63b (D-155) */}\n\n# T\n';
    expect(stripCopyHeader(mdx)).toBe('import { Meta } from "x";\n\n# T\n');
    const md = "<!-- copied from getproperty-web@08ff63b until collective-shared exists (D-155) -->\n\n# T\n";
    expect(stripCopyHeader(md)).toBe("# T\n");
    expect(hasCopyHeader("export const x = 1;\n")).toBe(false);
  });
});

describe("compare", () => {
  const entry = { path: "src/ui/a.ts", mode: "verbatim" as const, commit: "08ff63b" };
  const buf = (s: string) => Buffer.from(s);

  it("is the same when only the header differs", () => {
    expect(compare(entry, buf(`${H}\nconst a = 1;\n`), buf("const a = 1;\n"))).toBe("same");
  });
  it("reports drift, a missing header, and missing files", () => {
    expect(compare(entry, buf(`${H}\nconst a = 2;\n`), buf("const a = 1;\n"))).toBe("drift");
    expect(compare(entry, buf("const a = 1;\n"), buf("const a = 1;\n"))).toBe("no-header");
    expect(compare(entry, null, buf("x"))).toBe("missing-copy");
    expect(compare(entry, buf(`${H}\nx`), null)).toBe("missing-source");
  });
  it("never flags an adapted file as drift, and compares binaries byte for byte", () => {
    expect(compare({ ...entry, mode: "adapted" }, buf(`${H}\nconst a = 2;\n`), buf("const a = 1;\n"))).toBe("adapted");
    const font = { path: "src/ui/fonts/files/a.woff2", mode: "binary" as const, commit: "08ff63b" };
    expect(compare(font, buf("\u0001\u0002"), buf("\u0001\u0002"))).toBe("same");
    expect(compare(font, buf("\u0001"), buf("\u0002"))).toBe("drift");
  });
});

describe("expandEntry", () => {
  it("expands a dir/*.ext row to every such file in either tree and leaves plain rows alone", () => {
    const base = mkdtempSync(join(tmpdir(), "shared-check-"));
    const copy = join(base, "copy");
    const source = join(base, "source");
    for (const [root, files] of [
      [copy, ["a.ts", "b.ts", "notes.md"]],
      [source, ["b.ts", "c.ts"]],
    ] as const) {
      mkdirSync(join(root, "src/glyphs"), { recursive: true });
      for (const file of files) writeFileSync(join(root, "src/glyphs", file), "x");
    }
    const row = { path: "src/glyphs/*.ts", mode: "generated" as const, commit: "f57d4dc" };
    expect(expandEntry(row, [copy, source]).map((entry) => entry.path)).toEqual([
      "src/glyphs/a.ts",
      "src/glyphs/b.ts",
      "src/glyphs/c.ts",
    ]);
    const plain = { path: "src/ui/index.ts", mode: "verbatim" as const, commit: "f57d4dc" };
    expect(expandEntry(plain, [copy, source])).toEqual([plain]);
  });
});
