import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * One image for every environment (D-230): collective-infra's `promote.yml` ships the bytes that passed UAT to
 * production without a rebuild, so no environment value may be inlined by `next build`. Next replaces every literal
 * `process.env.NEXT_PUBLIC_…` at build time; this app reads them on the server at run time instead (`serverEnv()`,
 * `src/lib/env.ts`) and hands the browser what it needs through the server-rendered `<html data-*>` attributes
 * (`src/lib/publicConfig.ts`) or as props. getproperty-web has the same guard.
 *
 * Allowed: `NEXT_PUBLIC_LIFF_MOCK`, the build flavour (mock builds for e2e / Storybook / Lighthouse; the platform
 * image never sets it, so it is the same "0" in every environment).
 */
const ROOT = join(__dirname, "../..");
const SOURCES = ["src", "mocks", "next.config.ts"];
const BUILD_FLAVOUR = "NEXT_PUBLIC_LIFF_MOCK";

function files(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((name) => (name === "generated" ? [] : files(join(path, name))));
}

describe("run-time environment (D-230)", () => {
  it("no source reads a NEXT_PUBLIC_ variable that next build would inline (except the build flavour)", () => {
    const offenders = SOURCES.flatMap((source) => files(join(ROOT, source)))
      .filter((file) => /\.(ts|tsx|mts|js|mjs)$/.test(file) && !file.endsWith("runtime-env.test.ts"))
      .flatMap((file) =>
        [...readFileSync(file, "utf8").matchAll(/process\.env(?:\.|\[["'`])(NEXT_PUBLIC_\w+)/g)]
          .filter((match) => match[1] !== BUILD_FLAVOUR)
          .map((match) => `${relative(ROOT, file)}: ${match[1]}`),
      );
    expect(offenders).toEqual([]);
  });

  it("next.config.ts inlines nothing but the build flavour", () => {
    const config = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    const env = /\benv:\s*\{([^}]*)\}/.exec(config)?.[1] ?? "";
    expect(env.match(/NEXT_PUBLIC_\w+(?=:)/g) ?? []).toEqual([BUILD_FLAVOUR]);
  });
});
