/**
 * This app's own brand outputs, drawn from the founder's logo (`src/ui/brand/geometry.ts`, a byte-for-byte copy of
 * getproperty-web's `pnpm brand` output — docs/shared-copies.md). Everything else (favicons, app and PWA icons, PNG
 * logos) is copied from getproperty-web, not generated here.
 *
 *   pnpm brand          write the outputs below
 *   pnpm brand:check    fail when one is missing, stale or the wrong size (CI)
 *
 * Outputs (committed):
 *   docs/brand/line/getproperty-line-mini-app-icon.png   the LINE MINI App channel icon (docs/deployment.md §LINE):
 *       130 × 130 PNG — LINE's "background area (BG SIZE)" — the founder's app icon (white house, sky chimney on the
 *       house blue), full bleed (LINE crops the image itself), the house 70 px wide: inside LINE's 54–90 px logo
 *       range and its recommended 54–76 px (developers.line.biz → LINE MINI App → Design → LINE MINI App icon).
 *   public/offline.html — the logo between `<!-- brand:start -->` and `<!-- brand:end -->`: the founder's paths
 *       inline (the founder's colours; the founder's white version under `prefers-color-scheme: dark`). The page
 *       is served by the service worker with no network, so nothing may be fetched.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { format, resolveConfig } from "prettier";
import sharp from "sharp";

import {
  APP_ICON,
  CHIMNEY_GRADIENT,
  CHIMNEY_PATH,
  HOUSE_PATH,
  INK_PATH,
  LOGO_COLOURS,
  MARK_VIEWBOX,
  WORDMARK_VIEWBOX,
} from "../src/ui/brand/geometry";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const LINE_ICON = {
  file: "docs/brand/line/getproperty-line-mini-app-icon.png",
  /** LINE's background area (BG SIZE). */
  size: 130,
  /** The logo's width inside it: LINE allows 54–90 px and recommends 54–76 px. */
  logo: 70,
} as const;

const OFFLINE = "public/offline.html";
const BLOCKS = {
  style: ["<!-- brand-style:start (pnpm brand) -->", "<!-- brand-style:end -->"],
  logo: ["<!-- brand:start (pnpm brand) -->", "<!-- brand:end -->"],
} as const;

const { x1, y1, x2, y2 } = CHIMNEY_GRADIENT;

/** The founder's app icon as a full-bleed square with the house `logo` px wide in a `size` px square. */
export function lineIconSvg(size: number = LINE_ICON.size, logo: number = LINE_ICON.logo): string {
  const [mx, my, mw, mh] = MARK_VIEWBOX.split(" ").map(Number) as [number, number, number, number];
  const side = (mw * size) / logo;
  const x = mx - (side - mw) / 2;
  const y = my - (side - mh) / 2;
  const [top, bottom] = APP_ICON.chimney;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${side} ${side}" width="${size}" height="${size}">` +
    `<defs><linearGradient id="c" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>` +
    `<rect x="${x}" y="${y}" width="${side}" height="${side}" fill="${APP_ICON.fill}"/>` +
    `<path fill="#FFFFFF" fill-rule="evenodd" d="${HOUSE_PATH}"/>` +
    `<path fill="url(#c)" fill-rule="evenodd" d="${CHIMNEY_PATH}"/></svg>`
  );
}

/** The offline page's logo (the founder's paths; colours from the style block, so dark mode gets the white version). */
export function offlineLogo(): string {
  return (
    `<svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="${WORDMARK_VIEWBOX}" role="img" aria-label="getproperty">` +
    `<defs><linearGradient id="gp-chimney" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" class="t"/><stop offset="1" class="b"/></linearGradient></defs>` +
    `<path class="i" fill-rule="evenodd" d="${INK_PATH}"/><path class="h" fill-rule="evenodd" d="${HOUSE_PATH}"/>` +
    `<path fill="url(#gp-chimney)" fill-rule="evenodd" d="${CHIMNEY_PATH}"/></svg>`
  );
}

/** The logo's colours: the founder's on light, the founder's white version on dark. */
export function offlineLogoStyle(): string {
  return (
    `<style>.logo{display:block;height:36px;width:auto;margin:0 auto 24px}.logo .i{fill:${LOGO_COLOURS.navy}}` +
    `.logo .h{fill:${LOGO_COLOURS.blue}}.logo .t{stop-color:${LOGO_COLOURS.sky}}.logo .b{stop-color:${LOGO_COLOURS.azure}}` +
    `@media (prefers-color-scheme:dark){.logo .i,.logo .h{fill:#FFFFFF}.logo .t,.logo .b{stop-color:#FFFFFF}}</style>`
  );
}

function replaceBlock(html: string, [start, end]: readonly [string, string], body: string): string {
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from === -1 || to === -1 || to < from) throw new Error(`${OFFLINE}: markers ${start} … ${end} not found`);
  const indent = /[ \t]*$/.exec(html.slice(0, from))?.[0] ?? "";
  return `${html.slice(0, from)}${start}\n${indent}${body}\n${indent}${html.slice(to)}`;
}

/** `public/offline.html` with its brand blocks (style in the head, logo in the page) replaced by the current ones. */
export function withOfflineLogo(html: string): string {
  return replaceBlock(replaceBlock(html, BLOCKS.style, offlineLogoStyle()), BLOCKS.logo, offlineLogo());
}

export async function linePng(): Promise<Buffer> {
  return sharp(Buffer.from(lineIconSvg()), { density: 600 })
    .resize(LINE_ICON.size, LINE_ICON.size, { fit: "fill" })
    .flatten({ background: APP_ICON.fill })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** The offline page as committed: brand blocks replaced, then formatted like every other file (`pnpm format:check`). */
async function offlinePage(html: string): Promise<string> {
  const filepath = join(ROOT, OFFLINE);
  return format(withOfflineLogo(html), { ...(await resolveConfig(filepath)), filepath });
}

async function write(): Promise<void> {
  const file = join(ROOT, LINE_ICON.file);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, await linePng());
  console.info(`wrote ${LINE_ICON.file}`);
  const offline = join(ROOT, OFFLINE);
  writeFileSync(offline, await offlinePage(readFileSync(offline, "utf8")));
  console.info(`wrote ${OFFLINE} (logo block)`);
}

async function check(): Promise<void> {
  const problems: string[] = [];
  const file = join(ROOT, LINE_ICON.file);
  if (!existsSync(file)) problems.push(`${LINE_ICON.file} is missing`);
  else {
    const meta = await sharp(file).metadata();
    if (meta.format !== "png" || meta.width !== LINE_ICON.size || meta.height !== LINE_ICON.size) {
      problems.push(`${LINE_ICON.file} must be a ${LINE_ICON.size}×${LINE_ICON.size} PNG`);
    }
  }
  const html = readFileSync(join(ROOT, OFFLINE), "utf8");
  if ((await offlinePage(html)) !== html) problems.push(`${OFFLINE}: the logo block is stale`);
  if (problems.length) {
    console.error(`${problems.join("\n")}\nrun pnpm brand`);
    process.exit(1);
  }
  console.info("brand outputs are up to date");
}

if (process.argv[1]?.endsWith("build-brand.ts")) {
  void (process.argv.includes("--check") ? check() : write()).catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
