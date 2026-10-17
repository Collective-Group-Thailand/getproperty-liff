// copied from getproperty-web@f57d4dc until collective-shared exists (D-155) — adapted: one zone, port 3400, LIFF mocked
/**
 * Runs Lighthouse CI once per URL set (`docs/performance-budgets.md`).
 *
 * `lhci autorun` takes one config; each set is its own config in `lighthouse/` (today: `resident`, `public`;
 * L4 adds `technician`), they share `lighthouse/shared.json`, and this runs them in turn against one
 * production server with LIFF mocked.
 *
 *   pnpm lhci                 every set
 *   pnpm lhci resident        named sets only
 *   LHCI_PORT=3401 pnpm lhci  another port, when 3400 is taken
 *
 * Needs a prior `NEXT_PUBLIC_LIFF_MOCK=1 pnpm build` (the flag is inlined at build time). Not part of
 * `pnpm test`; CI runs it in its own job from L1.
 */

import { spawn, spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const PORT = Number(process.env.LHCI_PORT ?? 3400);
const ROOT = new URL("..", import.meta.url).pathname;
const SETS = process.argv.slice(2);

const env = {
  ...process.env,
  // Mock mode, so Lighthouse measures the same thing every time and the pages have a session (L1).
  API_MOCKS: "1",
  NEXT_PUBLIC_LIFF_MOCK: "1",
  NEXT_TELEMETRY_DISABLED: "1",
};

async function portTaken(): Promise<boolean> {
  try {
    await fetch(`http://localhost:${PORT}/`);
    return true;
  } catch {
    return false;
  }
}

async function waitForServer(): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (await portTaken()) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`The server did not come up on port ${PORT}.`);
}

const configs = readdirSync(join(ROOT, "lighthouse"))
  .filter((file) => file.endsWith(".json") && file !== "shared.json" && !file.startsWith("."))
  .map((file) => file.replace(/\.json$/, ""))
  .filter((name) => SETS.length === 0 || SETS.includes(name));

if (configs.length === 0) {
  console.error(`No URL set matched ${SETS.join(", ")}. Available: see lighthouse/*.json`);
  process.exit(1);
}

/** The set's config with its URLs on `LHCI_PORT`, written beside the original and removed afterwards. */
function configFor(name: string): { path: string; cleanup: () => void } {
  if (PORT === 3400) return { path: `lighthouse/${name}.json`, cleanup: () => undefined };
  const path = `lighthouse/.port-${PORT}-${name}.json`;
  writeFileSync(
    join(ROOT, path),
    readFileSync(join(ROOT, `lighthouse/${name}.json`), "utf8").replaceAll(":3400/", `:${PORT}/`),
  );
  return { path, cleanup: () => rmSync(join(ROOT, path), { force: true }) };
}

/**
 * Prints the initial JS each URL of the set loaded — Lighthouse's `resource-summary` script transfer
 * size, min–max over the runs — so a budget change in docs/performance-budgets.md quotes a measurement.
 */
function reportScriptSizes(name: string): void {
  const dir = join(ROOT, ".lighthouseci");
  const sizes = new Map<string, number[]>();
  for (const file of readdirSync(dir).filter((entry) => /^lhr-\d+\.json$/.test(entry))) {
    const report = JSON.parse(readFileSync(join(dir, file), "utf8")) as {
      requestedUrl: string;
      audits: Record<string, { details?: { items?: { resourceType: string; transferSize: number }[] } }>;
    };
    const script = report.audits["resource-summary"]?.details?.items?.find((item) => item.resourceType === "script");
    if (!script) continue;
    sizes.set(report.requestedUrl, [...(sizes.get(report.requestedUrl) ?? []), script.transferSize]);
  }
  for (const [url, values] of sizes) {
    const kb = (bytes: number) => (bytes / 1024).toFixed(1);
    console.info(`initial JS [${name}] ${url}: ${kb(Math.min(...values))}–${kb(Math.max(...values))} KB`);
  }
}

async function main(): Promise<void> {
  if (await portTaken()) {
    console.error(`Port ${PORT} is already in use. Set LHCI_PORT to a free port.`);
    process.exit(1);
  }
  // Its own process group, so stopping it also stops the `next-server` child pnpm starts.
  const server = spawn("pnpm", ["start", "-p", String(PORT)], { cwd: ROOT, env, stdio: "ignore", detached: true });
  const failures: string[] = [];

  try {
    await waitForServer();
    for (const name of configs) {
      console.info(`\n── lighthouse: ${name} ──`);
      const config = configFor(name);
      // Chrome refuses to sandbox as root (containers, CI images): only then is the sandbox switched off.
      const asRoot = typeof process.getuid === "function" && process.getuid() === 0;
      const flags = asRoot ? ["--collect.settings.chromeFlags=--no-sandbox --headless=new"] : [];
      const result = spawnSync("pnpm", ["exec", "lhci", "autorun", `--config=${config.path}`, ...flags], {
        cwd: ROOT,
        env,
        stdio: "inherit",
      });
      config.cleanup();
      reportScriptSizes(name);
      if (result.status !== 0) failures.push(name);
    }
  } finally {
    try {
      if (server.pid) process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill();
    }
  }

  if (failures.length > 0) {
    console.error(`\nLighthouse budgets failed for: ${failures.join(", ")}`);
    process.exit(1);
  }
  console.info("\nAll Lighthouse URL sets met their budgets.");
}

void main();
