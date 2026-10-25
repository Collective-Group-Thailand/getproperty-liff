// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { css, messageCodePoints, plan } from "../../scripts/script-fonts";
import { woff2CodePoints } from "./woff2";

const FILES = join(__dirname, "files");
const UI_FONTS = join(__dirname, "../ui/fonts/files");

/** Characters that are layout or punctuation only, drawn by any font of the stack (Latin, Thai or the system's). */
const NEUTRAL = new Set([
  0x200b, 0x200c, 0x200d, 0x2013, 0x2014, 0x2026, 0x201c, 0x201d, 0x2018, 0x2019, 0x00a0, 0x0e3f, 0x00b0, 0x2192,
  0x203a, 0x00d7, 0x00b3,
]);

function covered(files: string[]): Set<number> {
  const all = new Set<number>();
  for (const file of files) for (const cp of woff2CodePoints(readFileSync(file))) all.add(cp);
  return all;
}

/** The design system's own faces, ahead of / after the script family in every stack. */
const LATIN = [join(UI_FONTS, "anuphan-latin.woff2"), join(UI_FONTS, "anuphan-thai.woff2")];

/**
 * The language switcher names each language in its own script (`shell.languageNames`) on every page; those
 * endonyms are left to the phone's fonts (as every language list does) rather than pulling another script's font
 * into each page.
 */
function endonyms(locale: string): Set<number> {
  const names = JSON.parse(readFileSync(join(__dirname, "../i18n/messages", locale, "shared/shell.json"), "utf8"))
    .languageNames as Record<string, string>;
  const own = new Set([...names[locale]!].map((ch) => ch.codePointAt(0)!));
  const others = new Set<number>();
  for (const [key, name] of Object.entries(names)) {
    if (key !== locale) for (const ch of name) if (!own.has(ch.codePointAt(0)!)) others.add(ch.codePointAt(0)!);
  }
  return others;
}

describe("script fonts for my / km / lo / zh (L4 4.3, D-064)", () => {
  const { faces } = plan();
  const facesOf = (family: string) => faces.filter((f) => f.family === family).map((f) => join(FILES, f.file));

  it.each([
    ["my", "GP Noto Sans Myanmar"],
    ["km", "GP Noto Sans Khmer"],
    ["lo", "GP Noto Sans Lao"],
    ["zh", "GP Noto Sans SC"],
  ])("every character of the %s messages has a glyph in the stack — no tofu", (locale, family) => {
    const glyphs = covered([...facesOf(family), ...LATIN]);
    const skip = endonyms(locale);
    const missing = [...messageCodePoints(locale)].filter((cp) => !NEUTRAL.has(cp) && !skip.has(cp) && !glyphs.has(cp));
    expect(missing.map((cp) => `U+${cp.toString(16)} ${String.fromCodePoint(cp)}`)).toEqual([]);
  });

  it("ships the subsets the committed CSS names, each with its unicode-range, and the stacks per locale", () => {
    const committed = readFileSync(join(__dirname, "scripts.css"), "utf8");
    expect(committed).toBe(css(faces));
    for (const face of faces) expect(committed).toContain(`url("./files/${face.file}")`);
    for (const locale of ["my", "km", "lo", "zh"]) expect(committed).toContain(`html:lang(${locale}) {`);
    // Thai and English pages never name a script family.
    expect(committed).not.toMatch(/html:lang\((th|en)\)/);
  });

  it("reads a WOFF2 cmap (sanity: the Myanmar subset maps KA, the Latin one maps A)", () => {
    expect(woff2CodePoints(readFileSync(join(FILES, "noto-sans-myanmar.woff2"))).has(0x1000)).toBe(true);
    expect(covered(LATIN).has(0x41)).toBe(true);
  });
});
