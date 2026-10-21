import { existsSync } from "node:fs";

import { defineConfig, devices, type ReporterDescription } from "@playwright/test";

/**
 * Same shape as getproperty-web's config. Deliberately not 3300 (`pnpm dev`): the suite gets its own
 * port so a dev server can never make the run pass or fail by accident. The app is built with the fake
 * LIFF (`NEXT_PUBLIC_LIFF_MOCK=1`, inlined at build time), answers the API from the contract mocks
 * (`API_MOCKS=1`, `mocks/`) and runs with the technician flag on (L4). The run against the real API is its own
 * config (`playwright.integration.config.ts`, project `integration`).
 */
const PORT = Number(process.env.E2E_PORT ?? 3500);
const baseURL = `http://localhost:${PORT}`;

/**
 * A pre-installed Chromium instead of the one this Playwright version would download: set
 * `PW_CHROMIUM_EXECUTABLE` to its binary (and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`) on a machine that
 * cannot reach the browser CDN. CI downloads the matching build and leaves this unset.
 */
const executablePath = process.env.PW_CHROMIUM_EXECUTABLE;
if (executablePath && !existsSync(executablePath)) {
  throw new Error(`PW_CHROMIUM_EXECUTABLE points at ${executablePath}, which does not exist.`);
}

/** The reference device (design-system.md §1): a 360 × 780 Android phone inside LINE. */
const phone = {
  ...devices["Pixel 7"],
  viewport: { width: 360, height: 780 },
  screen: { width: 360, height: 780 },
};

/** Must match e2e/brand.spec.ts. */
const RUNTIME_LIFF_ID = "2000000000-e2eRuntime";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["integration/**"],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: (process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]]) satisfies ReporterDescription[],
  use: {
    baseURL,
    trace: "on-first-retry",
    launchOptions: executablePath ? { executablePath } : {},
  },
  // The project is called chromium like getproperty-web's, so `pnpm e2e` reads the same in both repos.
  projects: [{ name: "chromium", use: { ...phone, browserName: "chromium" } }],
  webServer: {
    // A production build locally as well as in CI: the pages must be tested as they ship. The LIFF id is given to the
    // server only, after the build (D-230: run-time public settings; e2e/brand.spec.ts checks it reaches the page
    // and no script).
    command: `pnpm build && NEXT_PUBLIC_LIFF_ID=${RUNTIME_LIFF_ID} pnpm start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_LIFF_MOCK: "1",
      NEXT_PUBLIC_LIFF_ID: "",
      API_MOCKS: "1",
      API_INTERNAL_URL: "",
      // L4: the technician screens are on in this suite (their guard and the BFF prefixes are unit-tested with the
      // flag off).
      FEATURE_TECHNICIAN: "1",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
