import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The founder's logo is server-rendered markup, never client JavaScript (D-179, docs/ui/brand.md): `/profile` sits at
 * the 180 KB initial-JS limit, and the logo's path data would add several KB to every page that imports it from a
 * client component. Client components receive the logo as a prop from a server component instead (the shells).
 */
const ROOT = join(__dirname, "../../../..");
const BRAND_IMPORT =
  /from\s+["'](?:@\/ui\/brand(?:\/[\w.]+)?|@\/features\/resident\/shell\/ResidentShellView|\.\/ResidentShellView)["']/;

function files(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => files(join(path, name)));
}

describe("brand boundary", () => {
  it("no client component imports the logo or the shell view", () => {
    const offenders = files(join(ROOT, "src"))
      .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.(test|stories)\.tsx?$/.test(file))
      .filter((file) => !file.includes(`${join("src", "ui")}/`))
      .filter((file) => {
        const text = readFileSync(file, "utf8");
        return /^\s*["']use client["']/.test(text) && BRAND_IMPORT.test(text);
      })
      .map((file) => relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});
