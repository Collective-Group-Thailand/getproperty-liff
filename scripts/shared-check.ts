/**
 * `pnpm shared:check` — compares the files this repo copied from getproperty-web (D-154, D-155) with
 * their source in `../getproperty-web`, when that checkout is present. **Warn-only**: it always exits 0
 * (pass `--strict` to make drift fail), because a copy is allowed to lag until someone re-copies it on
 * purpose; the point is that drift is visible, not that it is blocked.
 *
 * The manifest is the table in `docs/shared-copies.md` (`| path | mode | source commit |`). Modes:
 *   verbatim   identical to the source apart from the one-line "copied from" header
 *   adapted    deliberately changed (single zone, subset); reported, never "fixed"
 *   generated  produced here by a copied script (`pnpm tokens`, `pnpm fonts`); compared byte for byte
 *   binary     compared byte for byte
 *
 *   pnpm shared:check                    report against ../getproperty-web
 *   SHARED_SOURCE=/path pnpm shared:check another checkout
 *   pnpm shared:check --strict           exit 1 on drift (for a deliberate re-sync session)
 *
 * A row may name every file of one directory with an extension glob — `src/ui/icons/glyphs/*.ts` (D-179: one
 * generated module per icon) — which stands for each such file in the source *and* in the copy, so a glyph
 * added or removed on either side shows up as missing.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type CopyMode = "verbatim" | "adapted" | "generated" | "binary";
export interface ManifestEntry {
  path: string;
  mode: CopyMode;
  commit: string;
}
export type CheckStatus = "same" | "drift" | "adapted" | "missing-source" | "missing-copy" | "no-header";

const MODES: readonly CopyMode[] = ["verbatim", "adapted", "generated", "binary"];

/** Reads the manifest rows out of the markdown table; other lines are ignored. */
export function parseManifest(markdown: string): ManifestEntry[] {
  const rows: ManifestEntry[] = [];
  for (const line of markdown.split("\n")) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim().replace(/^`|`$/g, ""));
    if (cells.length !== 3) continue;
    const [path, mode, commit] = cells as [string, string, string];
    if (!(MODES as readonly string[]).includes(mode)) continue;
    rows.push({ path, mode: mode as CopyMode, commit });
  }
  return rows;
}

const HEADER = /^(?:\/\/|\/\*|<!--|\{\/\*)\s*(?:copied|adapted) from getproperty-web@[0-9a-f]+.*$/;

/** True when the text carries the "copied from getproperty-web@<commit>" header in its first lines. */
export function hasCopyHeader(text: string): boolean {
  return text
    .split("\n")
    .slice(0, 4)
    .some((line) => HEADER.test(line.trim()));
}

/** The text without the copy header line (and the blank line an MDX or Markdown header leaves behind). */
export function stripCopyHeader(text: string): string {
  const lines = text.split("\n");
  const index = lines.slice(0, 4).findIndex((line) => HEADER.test(line.trim()));
  if (index === -1) return text;
  // MDX and Markdown headers sit on their own paragraph, so a blank line follows them.
  const ownParagraph = /^(\{\/\*|<!--)/.test(lines[index]!.trim());
  lines.splice(index, ownParagraph && lines[index + 1] === "" ? 2 : 1);
  return lines.join("\n");
}

export function compare(entry: ManifestEntry, copy: Buffer | null, source: Buffer | null): CheckStatus {
  if (!copy) return "missing-copy";
  if (!source) return "missing-source";
  if (entry.mode === "binary" || entry.mode === "generated") return copy.equals(source) ? "same" : "drift";
  const text = copy.toString("utf8");
  const needsHeader = !/\.(json|woff2)$/.test(entry.path);
  if (needsHeader && !hasCopyHeader(text)) return "no-header";
  if (entry.mode === "adapted") return "adapted";
  return stripCopyHeader(text) === source.toString("utf8") ? "same" : "drift";
}

/** Expands a `dir/*.ext` row into one entry per file found in either tree; other rows pass through. */
export function expandEntry(entry: ManifestEntry, roots: readonly string[]): ManifestEntry[] {
  const glob = /^(.*)\/\*(\.[A-Za-z0-9]+)$/.exec(entry.path);
  if (!glob) return [entry];
  const [, dir, extension] = glob as unknown as [string, string, string];
  const names = new Set<string>();
  for (const root of roots) {
    const path = join(root, dir);
    if (!existsSync(path)) continue;
    for (const name of readdirSync(path)) if (name.endsWith(extension)) names.add(name);
  }
  return [...names].sort().map((name) => ({ ...entry, path: `${dir}/${name}` }));
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const sourceRoot = resolve(root, process.env.SHARED_SOURCE ?? "../getproperty-web");
  const strict = process.argv.includes("--strict");
  const rows = parseManifest(readFileSync(join(root, "docs/shared-copies.md"), "utf8"));
  const entries = rows.flatMap((row) => expandEntry(row, [root, sourceRoot]));
  const sourcePresent = existsSync(join(sourceRoot, "src/ui"));

  if (!sourcePresent) {
    console.warn(`shared:check — ${sourceRoot} not found; ${entries.length} copies listed, nothing compared.`);
  }

  const counts: Partial<Record<CheckStatus, number>> = {};
  const problems: string[] = [];
  for (const entry of entries) {
    const copyPath = join(root, entry.path);
    const copy = existsSync(copyPath) ? readFileSync(copyPath) : null;
    if (!sourcePresent) {
      if (!copy) problems.push(`missing-copy  ${entry.path}`);
      continue;
    }
    const sourcePath = join(sourceRoot, entry.path);
    const status = compare(entry, copy, existsSync(sourcePath) ? readFileSync(sourcePath) : null);
    counts[status] = (counts[status] ?? 0) + 1;
    if (status !== "same" && status !== "adapted") problems.push(`${status.padEnd(14)}${entry.path}`);
  }

  const summary = Object.entries(counts)
    .map(([status, n]) => `${n} ${status}`)
    .join(", ");
  if (sourcePresent) console.info(`shared:check — ${entries.length} copies vs ${sourceRoot}: ${summary}`);
  for (const problem of problems) console.warn(`  warn  ${problem}`);
  if (problems.length > 0) {
    console.warn("  Re-copy from getproperty-web (and bump the commit in docs/shared-copies.md), or mark it adapted.");
  }
  process.exit(strict && problems.length > 0 ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
