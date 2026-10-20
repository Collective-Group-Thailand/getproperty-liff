/**
 * Noto Sans Myanmar / Khmer / Lao / SC subsets for the R2 resident languages (L4 4.3, D-064) — owned here until
 * getproperty-web's `src/ui/fonts` gains them (docs/shared-copies.md). The woff2 files come from the
 * `@fontsource-variable/*` npm packages (no Google Fonts at build or run time, ADR-0001):
 *
 *   - Myanmar, Khmer, Lao: each package's script subset (the Latin part comes from the design system's own font);
 *   - Simplified Chinese: only the unicode-range slices that hold a character of the zh messages (Noto Sans SC is
 *     split in ~100 slices by frequency; a phone in Chinese has a system CJK font for anything else the API sends).
 *
 * It writes `src/fonts/files/*.woff2` and `src/fonts/scripts.css`: one `@font-face` per file with its unicode-range
 * (a browser downloads a face only for text that needs it) and, per locale, the stacks `html:lang(my)` … that put the
 * script family after the Latin one — so a Thai or English page never even considers these files.
 *
 *   pnpm fonts:scripts            copy and write the CSS
 *   pnpm fonts:scripts --check    fail when the committed files or CSS differ (CI; after a zh copy change)
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/fonts");
const FILES = join(OUT, "files");
const MESSAGES = join(ROOT, "src/i18n/messages");

export interface Face {
  family: string;
  file: string;
  ranges: [number, number][];
}

export function parseRanges(text: string): [number, number][] {
  return text.split(",").map((part) => {
    const [from, to] = part.trim().replace(/^U\+/i, "").split("-");
    return [parseInt(from!, 16), parseInt(to ?? from!, 16)] as [number, number];
  });
}

/** `@font-face` blocks of a fontsource CSS file: the woff2 file and its unicode-range. */
export function parseFontsourceCss(css: string): { file: string; ranges: [number, number][] }[] {
  const faces: { file: string; ranges: [number, number][] }[] = [];
  for (const block of css.split("@font-face").slice(1)) {
    const file = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(block)?.[1];
    const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
    if (file && range) faces.push({ file, ranges: parseRanges(range) });
  }
  return faces;
}

const inRanges = (cp: number, ranges: readonly [number, number][]) => ranges.some(([a, b]) => cp >= a && cp <= b);

/** Every code point of a locale's messages (values only), beyond ASCII. */
export function messageCodePoints(locale: string): Set<number> {
  const out = new Set<number>();
  const walk = (value: unknown) => {
    if (typeof value === "string") for (const ch of value) out.add(ch.codePointAt(0)!);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  for (const namespace of readdirSync(join(MESSAGES, locale))) {
    for (const file of readdirSync(join(MESSAGES, locale, namespace))) {
      walk(JSON.parse(readFileSync(join(MESSAGES, locale, namespace, file), "utf8")));
    }
  }
  for (const cp of [...out]) if (cp < 0x80) out.delete(cp);
  return out;
}

function pkgDir(pkg: string): string {
  return dirname(require.resolve(`${pkg}/package.json`));
}

const SCRIPTS = [
  { locale: "my", family: "GP Noto Sans Myanmar", pkg: "@fontsource-variable/noto-sans-myanmar", subset: "myanmar" },
  { locale: "km", family: "GP Noto Sans Khmer", pkg: "@fontsource-variable/noto-sans-khmer", subset: "khmer" },
  { locale: "lo", family: "GP Noto Sans Lao", pkg: "@fontsource-variable/noto-sans-lao", subset: "lao" },
] as const;

const SC = { locale: "zh", family: "GP Noto Sans SC", pkg: "@fontsource-variable/noto-sans-sc" } as const;

/** The faces to ship, with their source paths. */
export function plan(): { faces: Face[]; sources: Map<string, string> } {
  const faces: Face[] = [];
  const sources = new Map<string, string>();
  for (const script of SCRIPTS) {
    const dir = pkgDir(script.pkg);
    const css = parseFontsourceCss(readFileSync(join(dir, "wght.css"), "utf8"));
    const face = css.find((f) => f.file.includes(`-${script.subset}-wght-normal`))!;
    const name = `noto-sans-${script.subset}.woff2`;
    faces.push({ family: script.family, file: name, ranges: face.ranges });
    sources.set(name, join(dir, "files", face.file));
  }
  const dir = pkgDir(SC.pkg);
  const slices = parseFontsourceCss(readFileSync(join(dir, "wght.css"), "utf8"));
  const needed = [...messageCodePoints("zh")].filter((cp) => cp >= 0x2e80);
  for (const slice of slices) {
    if (!needed.some((cp) => inRanges(cp, slice.ranges))) continue;
    const index = /noto-sans-sc-(\d+)-wght/.exec(slice.file)![1]!;
    const name = `noto-sans-sc-${index}.woff2`;
    faces.push({ family: SC.family, file: name, ranges: slice.ranges });
    sources.set(name, join(dir, "files", slice.file));
  }
  return { faces, sources };
}

const hex = (n: number) => n.toString(16);

export function css(faces: Face[]): string {
  const blocks = faces.map(
    (f) => `@font-face {
  font-family: "${f.family}";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("./files/${f.file}") format("woff2");
  unicode-range: ${f.ranges.map(([a, b]) => (a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`)).join(", ")};
}`,
  );
  const stacks = [...SCRIPTS, SC].map(
    (s) => `html:lang(${s.locale}) {
  --font-sans: var(--font-gp-sans-latin), "${s.family}", var(--font-gp-sans-thai), ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-gp-display-latin), "${s.family}", var(--font-gp-display-thai), ui-sans-serif, system-ui,
    sans-serif;
}`,
  );
  return `/* generated by scripts/script-fonts.ts (pnpm fonts:scripts) — do not edit; L4 4.3, D-064 */
/*
 * Myanmar, Khmer, Lao and Simplified Chinese faces (Noto Sans, SIL OFL 1.1, from @fontsource-variable/*). Each face
 * is downloaded only for text in its unicode-range, and only the page of that locale names the family in its stack.
 */
${blocks.join("\n\n")}

${stacks.join("\n\n")}

/* Myanmar stacks its vowel signs high and low: a little more line height keeps lines from touching. */
html:lang(my) body {
  line-height: 1.75;
}
`;
}

function main(): void {
  const check = process.argv.includes("--check");
  const { faces, sources } = plan();
  const expectedCss = css(faces);
  if (check) {
    let stale = 0;
    for (const [name, source] of sources) {
      const target = join(FILES, name);
      if (!existsSync(target) || !readFileSync(source).equals(readFileSync(target))) {
        stale += 1;
        process.stdout.write(`STALE ${name}\n`);
      }
    }
    const extra = existsSync(FILES) ? readdirSync(FILES).filter((f) => !sources.has(f)) : [];
    for (const name of extra) process.stdout.write(`EXTRA ${name}\n`);
    const cssPath = join(OUT, "scripts.css");
    const cssSame = existsSync(cssPath) && readFileSync(cssPath, "utf8") === expectedCss;
    if (!cssSame) process.stdout.write("STALE scripts.css\n");
    if (stale || extra.length || !cssSame) {
      process.stderr.write("script fonts differ from the zh messages / packages — run pnpm fonts:scripts\n");
      process.exit(1);
    }
    process.stdout.write(`script fonts ok (${faces.length} faces)\n`);
    return;
  }
  rmSync(FILES, { recursive: true, force: true });
  mkdirSync(FILES, { recursive: true });
  for (const [name, source] of sources) copyFileSync(source, join(FILES, name));
  writeFileSync(join(OUT, "scripts.css"), expectedCss);
  process.stdout.write(`wrote ${faces.length} faces to src/fonts\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
