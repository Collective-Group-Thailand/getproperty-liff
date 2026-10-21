import { expect, test, type Page } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, seedSession, subject } from "./support";

/**
 * The founder's logo (getproperty-web 79541bc, docs/ui/brand.md) and the run-time public settings (D-230).
 *
 * `playwright.config.ts` builds without `NEXT_PUBLIC_LIFF_ID` and starts the server with `RUNTIME_LIFF_ID`: the id
 * reaching the page proves it is read at run time, and no client chunk containing it proves nothing was inlined.
 */
const RUNTIME_LIFF_ID = "2000000000-e2eRuntime";

/** The full logo, drawn and named (never set in a font). */
async function expectNamedLogo(page: Page, scope = page.locator("body")) {
  const logo = scope.locator('svg[data-brand="wordmark"][role="img"][aria-label="getproperty"]').first();
  await expect(logo).toBeVisible();
  expect(await logo.locator("path").count()).toBe(3);
  const box = await logo.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(100);
}

test.describe("brand", () => {
  test("every page links the founder's icons and the brand theme colour", async ({ page, request }) => {
    await page.goto("/auth");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#1A4BA3");
    await expect(page.locator('link[rel="icon"][href="/favicon.ico"]')).toHaveCount(1);
    await expect(page.locator('link[rel="icon"][href="/brand/favicon.svg"]')).toHaveAttribute("type", "image/svg+xml");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");
    for (const path of ["/favicon.ico", "/brand/favicon.svg", "/icons/apple-touch-icon.png"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
    }
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.theme_color).toBe("#1A4BA3");
    for (const icon of manifest.icons as { src: string }[]) expect((await request.get(icon.src)).status()).toBe(200);
    // The placeholder is gone.
    expect((await request.get("/brand/wordmark.svg")).status()).toBe(404);
  });

  test("sign-in and the SMS code show the logo above the form, not twice", async ({ page }) => {
    await page.goto("/auth");
    await expectNamedLogo(page, page.getByTestId("brand-hero"));
    await expect(page.getByTestId("shell-leading").locator("svg")).toHaveCount(0);
    await expect(page.locator('svg[data-brand="wordmark"]')).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test("the signed-in header carries the house before the unit; the logo is server-rendered markup", async ({
    page,
    context,
    baseURL,
  }) => {
    const scripts: string[] = [];
    page.on("response", async (response) => {
      if (response.url().includes("/_next/static/") && response.url().endsWith(".js")) {
        scripts.push(await response.text().catch(() => ""));
      }
    });
    await seedSession(context, baseURL!, subject("brand"));
    await page.goto("/profile");
    const leading = page.getByTestId("shell-leading");
    await expect(leading.locator('svg[data-brand="mark"][aria-hidden="true"]')).toBeVisible();
    await expect(page.getByTestId("header-unit")).toBeVisible();
    await page.waitForLoadState("networkidle");
    // The chimney's path data is in the HTML, not in any script the page loaded.
    const chimney = "M368.90 11.10 L380.50 11.10";
    expect(await page.content()).toContain(chimney);
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(script.includes(chimney)).toBe(false);
    await expectNoHorizontalScroll(page);
  });

  test("the technician sign-in carries the logo above the form", async ({ page }) => {
    // FEATURE_TECHNICIAN=1 in this suite.
    await page.goto("/technician/sign-in");
    await expectNamedLogo(page, page.getByTestId("brand-hero"));
    await expectAxeClean(page);
  });

  test("the offline page draws the logo inline (no request, no script)", async ({ page, request }) => {
    const html = await (await request.get("/offline.html")).text();
    expect(html).toContain('aria-label="getproperty"');
    expect(html).not.toContain("<script");
    await page.goto("/offline.html");
    const logo = page.locator('svg.logo[role="img"]');
    await expect(logo).toBeVisible();
    await expectAxeClean(page);
  });
});

test.describe("run-time public settings (D-230)", () => {
  test("the LIFF id comes from the server at run time and is not compiled into any script", async ({ page }) => {
    const scripts: string[] = [];
    page.on("response", async (response) => {
      if (response.url().endsWith(".js")) scripts.push(await response.text().catch(() => ""));
    });
    await page.goto("/auth");
    await expect(page.locator("html")).toHaveAttribute("data-liff-id", RUNTIME_LIFF_ID);
    await page.waitForLoadState("networkidle");
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(script.includes(RUNTIME_LIFF_ID)).toBe(false);
  });
});
