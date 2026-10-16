import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * L0 smoke at the reference device (360 × 780, playwright.config.ts): the resident home and the LIFF
 * entry render, are axe-clean (WCAG 2.2 AA) and never scroll sideways. LIFF is the in-memory fake
 * (`NEXT_PUBLIC_LIFF_MOCK=1` at build time).
 */
const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

test.describe("resident home", () => {
  test("renders the unit card, the open-invoice hero and the tiles in Thai", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);

    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "th");
    await expect(html).toHaveAttribute("data-zone", "resident");
    // Follows the phone: no data-theme until the resident picks one.
    await expect(html).not.toHaveAttribute("data-theme", /.+/);

    const home = page.getByTestId("resident-home");
    await expect(home.getByRole("heading", { level: 1 })).toHaveText("สวัสดี สมชาย");
    await expect(home.getByRole("heading", { name: "ห้องของคุณ" })).toBeVisible();
    await expect(home.getByText("฿4,850.50")).toBeVisible();
    await expect(home.getByRole("link", { name: "สแกนจ่าย" })).toBeVisible();
    for (const tile of ["บิลและใบเสร็จ", "การใช้น้ำไฟ", "แจ้งซ่อม", "สัญญาเช่า", "ประกาศ", "พัสดุ"]) {
      await expect(home.getByRole("link", { name: tile })).toBeVisible();
    }

    // The bottom nav is there on a phone, with the current page marked.
    const nav = page.getByRole("navigation", { name: "เมนูด่วน" });
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: "หน้าแรก" })).toHaveAttribute("aria-current", "page");

    await expect(page.locator("main#main")).toHaveCount(1);
    await expectNoHorizontalScroll(page);
  });

  test("is axe-clean", async ({ page }) => {
    await page.goto("/");
    await expectAxeClean(page);
  });

  test("speaks English when gp_locale=en", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "gp_locale", value: "en", url: baseURL! }]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hello, สมชาย");
  });

  test("falls back to English copy for a scaffolded locale (D-064)", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "gp_locale", value: "km", url: baseURL! }]);
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "km");
    await expect(page.getByRole("link", { name: "Scan to pay" })).toBeVisible();
  });

  test("sends the LIFF-first security headers", async ({ request }) => {
    const response = await request.get("/");
    const csp = response.headers()["content-security-policy"] ?? "";
    expect(csp).toContain("https://api.line.me");
    expect(csp).toContain("object-src 'none'");
    expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });
});

test.describe("LIFF entry", () => {
  test("runs init → login → deep link on the fake LIFF and offers the target", async ({ page }) => {
    await page.goto("/liff?liff.state=%2Fbills%2F42");
    const entry = page.getByTestId("liff-entry");
    await expect(entry).toHaveAttribute("data-status", "ready");
    for (const step of ["init", "login", "link"]) {
      await expect(entry.locator(`[data-step="${step}"]`)).toHaveAttribute("data-state", "done");
    }
    await expect(page.getByText("โหมดทดสอบ: ใช้ LINE จำลอง")).toBeVisible();
    await expect(page.getByTestId("liff-continue")).toHaveAttribute("href", "/bills/42");
    await expectNoHorizontalScroll(page);
  });

  test("never redirects off-site from liff.state", async ({ page }) => {
    await page.goto("/liff?liff.state=%2F%2Fevil.example");
    await expect(page.getByTestId("liff-entry")).toHaveAttribute("data-status", "ready");
    await expect(page.getByTestId("liff-continue")).toHaveAttribute("href", "/");
  });

  test("remembers LINE's language for the next render", async ({ page, context }) => {
    await page.goto("/liff");
    await expect(page.getByTestId("liff-entry")).toHaveAttribute("data-status", "ready");
    const cookie = (await context.cookies()).find((c) => c.name === "gp_locale");
    expect(cookie?.value).toBe("th");
  });

  test("is axe-clean", async ({ page }) => {
    await page.goto("/liff");
    await expect(page.getByTestId("liff-entry")).toHaveAttribute("data-status", "ready");
    await expectAxeClean(page);
  });
});

test.describe("placeholders", () => {
  test("the technician screen is hidden while FEATURE_TECHNICIAN is off (R2)", async ({ page }) => {
    const response = await page.goto("/technician");
    expect(response?.status()).toBe(404);
  });

  test("an unknown path renders the not-found page inside the shell", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "ไม่พบหน้านี้" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "เมนูด่วน" })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("the BFF is not implemented yet (L1)", async ({ request }) => {
    const response = await request.get("/bff/v1/resident/me");
    expect(response.status()).toBe(501);
  });

  test("serves an installable manifest with the brand icons", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(["192x192", "512x512", "512x512"]);
    expect((await request.get(manifest.icons[0].src)).status()).toBe(200);
  });
});
