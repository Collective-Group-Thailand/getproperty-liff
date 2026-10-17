import { existsSync } from "node:fs";

import { defineConfig, devices } from "@playwright/test";

/**
 * Visual snapshots of the resident shell's Storybook stories (L1 1.3 §7), at the reference phone. Needs a prior
 * `pnpm build-storybook`; baselines live in `e2e-visual/__screenshots__` (Linux Chromium — CI uses the same).
 * Update deliberately with `pnpm test:visual --update-snapshots`.
 */
const PORT = Number(process.env.VISUAL_PORT ?? 6007);
const executablePath = process.env.PW_CHROMIUM_EXECUTABLE;
if (executablePath && !existsSync(executablePath)) {
  throw new Error(`PW_CHROMIUM_EXECUTABLE points at ${executablePath}, which does not exist.`);
}

export default defineConfig({
  testDir: "./e2e-visual",
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-visual" }]]
    : [["list"]],
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: "disabled" } },
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      name: "storybook",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 360, height: 780 },
        deviceScaleFactor: 1,
        browserName: "chromium",
      },
    },
  ],
  webServer: {
    command: `tsx scripts/serve-static.ts storybook-static ${PORT}`,
    url: `http://localhost:${PORT}/iframe.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
