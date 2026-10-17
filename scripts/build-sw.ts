/**
 * `pnpm sw` — bundles `src/sw/sw.ts` (Workbox modules + the cache policy) into `public/sw.js` with esbuild.
 * Runs before every `next build` (package.json); the output is generated, so it is git-ignored.
 */
import { build } from "esbuild";

void build({
  entryPoints: ["src/sw/sw.ts"],
  outfile: "public/sw.js",
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  sourcemap: false,
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  legalComments: "none",
  logLevel: "warning",
}).then(() => console.info("wrote public/sw.js"));
