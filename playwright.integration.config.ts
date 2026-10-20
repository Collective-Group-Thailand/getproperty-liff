import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

import { API_PORT, S3_ORIGIN } from "./e2e/integration/harness";

/**
 * The `integration` project (L1): this app against the **real** getproperty-api — PostgreSQL started with the
 * API's `pnpm db:local`, migrations, seeds, `DATA_STORES_MODE=real`, the fake LINE verifier
 * (`e2e/integration/harness.ts`). The app is the same mock build as `pnpm e2e` (the fake LIFF needs
 * `NEXT_PUBLIC_LIFF_MOCK=1`) but with `API_MOCKS` off and `API_INTERNAL_URL` pointing at the API.
 *
 *   pnpm e2e:integration      (needs ../getproperty-api installed; builds its dist when missing)
 */
const PORT = Number(process.env.INTEGRATION_PORT ?? 3600);
const baseURL = `http://localhost:${PORT}`;
const executablePath = process.env.PW_CHROMIUM_EXECUTABLE;
if (executablePath && !existsSync(executablePath)) {
  throw new Error(`PW_CHROMIUM_EXECUTABLE points at ${executablePath}, which does not exist.`);
}

export default defineConfig({
  testDir: "./e2e/integration",
  testMatch: /.*\.int\.spec\.ts$/,
  globalSetup: "./e2e/integration/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-integration" }]]
    : [["list"]],
  use: { baseURL, trace: "retain-on-failure", launchOptions: executablePath ? { executablePath } : {} },
  projects: [
    {
      name: "integration",
      use: { ...devices["Pixel 7"], viewport: { width: 360, height: 780 }, browserName: "chromium" },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `${baseURL}/auth`,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_LIFF_MOCK: "1",
      API_MOCKS: "",
      API_INTERNAL_URL: `http://127.0.0.1:${API_PORT}`,
      // L4: the technician app against the real /v1/auth/technician/* and /v1/technician/*.
      FEATURE_TECHNICIAN: "1",
      // Presigned photo uploads go to the harness's object store (CSP connect-src / img-src).
      NEXT_PUBLIC_ASSET_BASE_URL: S3_ORIGIN,
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
