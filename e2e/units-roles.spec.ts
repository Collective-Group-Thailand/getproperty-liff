import { expect, test } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, seedSession, subject } from "./support";

/**
 * JRL (D-309, D-322) — units and roles: the co-owner's home and menus, the household member's, the unit switcher
 * remembering a choice across units of different roles, and redeeming a co-owner's unit invitation with every refusal.
 * Mock scenario words: `coowner` (C-1203 in a juristic condominium, no lease), `family` (lives in A-201, no lease),
 * `coowner` + `multi` (rents A-201 and co-owns C-1203); invitation codes `OWN-…` (`mocks/units.ts`).
 * Written for the deferred e2e run (founder 2026-10-28).
 */
async function checkPage(page: import("@playwright/test").Page) {
  await expectNoHorizontalScroll(page);
  await expectAxeClean(page);
}

test.describe("units and roles", () => {
  test("a co-owner who does not live there: common fees, notices, documents; no lease, usage or door codes", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("coowner"));
    await page.goto("/");
    await expect(page.getByTestId("header-unit")).toHaveText("ห้อง C-1203");
    await expect(page.getByTestId("home-unit")).toContainText("เจ้าของร่วม");
    const hero = page.getByTestId("home-invoice");
    await expect(hero).toContainText("ค่าส่วนกลาง");
    await expect(hero.getByTestId("home-pay")).toBeVisible();
    await expect(page.getByTestId("home-notices")).toBeVisible();
    await expect(page.getByTestId("home-documents")).toContainText("ใบเสร็จ");
    await expect(page.getByTestId("unit-lease")).toHaveCount(0);
    const tiles = page.getByTestId("home-tiles");
    await expect(tiles.getByRole("link", { name: /^รหัสประตู/ })).toHaveCount(0);
    await expect(tiles.getByRole("link", { name: /^ระเบียบอาคาร/ })).toBeVisible();
    await expect(tiles.getByRole("link", { name: /^เบอร์ติดต่อ/ })).toBeVisible();
    const nav = page.getByRole("navigation", { name: "เมนูด่วน" });
    await expect(nav.getByRole("link")).toHaveText(["หน้าแรก", "บิล", "แจ้งซ่อม", "ฉัน"]);
    await checkPage(page);

    // Lease-bound and occupant-only screens are not there for them.
    expect((await page.goto("/usage"))?.status()).toBe(404);
    expect((await page.goto("/access"))?.status()).toBe(404);
    // House rules and contacts follow the unit, no lease needed.
    expect((await page.goto("/rules"))?.status()).toBe(200);
    expect((await page.goto("/contacts"))?.status()).toBe(200);
  });

  test("a household member: notices and parcels; no bills, no lease", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("family"));
    await page.goto("/");
    await expect(page.getByTestId("header-unit")).toHaveText("ห้อง A-201");
    await expect(page.getByTestId("home-invoice")).toHaveCount(0);
    await expect(page.getByTestId("home-no-invoice")).toHaveCount(0);
    await expect(page.getByTestId("home-parcels")).toContainText("พัสดุ");
    await expect(page.getByTestId("home-notices")).toBeVisible();
    await expect(page.getByTestId("unit-lease")).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: "เมนูด่วน" });
    await expect(nav.getByRole("link", { name: "บิล" })).toHaveCount(0);
    await expect(nav.getByRole("link", { name: "การใช้" })).toBeVisible();
    await checkPage(page);
    await nav.getByRole("link", { name: "การใช้" }).click();
    await expect(page.getByTestId("usage-view")).toBeVisible();
  });

  test("the switcher shows my role per unit, changes the home with it and remembers the choice", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("coowner", "multi"));
    await page.goto("/");
    await expect(page.getByTestId("header-unit")).toHaveText("ห้อง A-201");
    await expect(page.getByTestId("unit-lease")).toBeVisible();
    await page.getByTestId("unit-switcher").click();
    const sheet = page.getByRole("dialog", { name: "เลือกห้อง" });
    await expect(sheet).toContainText("ทุกห้องของฉัน (2)");
    await expect(sheet.locator('[data-role="tenant"]')).toHaveText("ผู้เช่า");
    await expect(sheet.locator('[data-role="co_owner"]')).toHaveText("เจ้าของร่วม");
    await checkPage(page);
    await sheet.getByRole("button", { name: /ห้อง C-1203/ }).click();
    await expect(page.getByTestId("header-unit")).toHaveText("ห้อง C-1203");
    await expect(page.getByTestId("home-documents")).toBeVisible();
    await expect(page.getByTestId("unit-lease")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("header-unit")).toHaveText("ห้อง C-1203");
    // The cookie lost (LINE's browser): the stored choice comes back by itself.
    await context.clearCookies({ name: "gp_unit" });
    await page.reload();
    await expect(page.getByTestId("header-unit")).toHaveText("ห้อง C-1203");
    // Bills: every unit by default, one unit with the filter.
    await page.goto("/invoices");
    await expect(page.getByTestId("invoice-unit-option")).toHaveText(["ทุกห้อง (2)", "ห้อง A-201", "ห้อง C-1203"]);
    await page.getByTestId("invoice-unit-option").filter({ hasText: "C-1203" }).click();
    await expect(page).toHaveURL(/\/invoices\?unit=/);
    await expect(page.getByTestId("open-invoice")).toHaveCount(1);
    await checkPage(page);
  });

  test("redeems a co-owner's invitation: preview → code (a wrong one first) → the new unit's home", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("redeem"));
    await page.goto("/join/OWN-OK-1");
    await expect(page).toHaveURL(/\/link\/unit\?code=OWN-OK-1$/);
    const preview = page.getByTestId("unit-redeem-preview");
    await expect(preview).toContainText("ห้อง C-1203");
    await expect(preview).toContainText("+66•••••1234");
    await checkPage(page);
    await page.getByTestId("unit-redeem-send").click();
    await expect(page.getByTestId("unit-redeem-code")).toBeVisible();
    await expect(page.getByTestId("unit-redeem-resend")).toBeDisabled();
    await page.keyboard.type("111111");
    await expect(page.getByRole("alert").filter({ hasText: "รหัสไม่ถูกต้อง" })).toContainText("ลองได้อีก 4 ครั้ง");
    await checkPage(page);
    await page.keyboard.type("123456");
    await expect(page.getByTestId("unit-redeem-done")).toContainText("เพิ่มห้อง C-1203 แล้ว");
    await page.getByTestId("unit-redeem-continue").click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("header-unit")).toHaveText("ห้อง C-1203");
    await expect(page.getByTestId("home-invoice")).toContainText("ค่าส่วนกลาง");

    // The same code again: used.
    await page.goto("/link/unit?code=OWN-OK-1");
    await expect(page.getByTestId("unit-redeem-closed")).toHaveAttribute("data-problem", "notPending");
  });

  test("every refusal of an invitation has its own screen", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("refusals"));
    await page.goto("/link/unit?code=NOPE-1234");
    await expect(page.getByTestId("unit-redeem-closed")).toHaveAttribute("data-problem", "notFound");
    await checkPage(page);
    await page.goto("/link/unit?code=OWN-USED-1");
    await expect(page.getByTestId("unit-redeem-closed")).toHaveAttribute("data-problem", "notPending");
    await page.goto("/link/unit?code=OWN-NOPHONE-1");
    await page.getByTestId("unit-redeem-send").click();
    await expect(page.getByTestId("unit-redeem-closed")).toHaveAttribute("data-problem", "phoneMissing");
    await page.goto("/link/unit?code=OWN-RATE-1");
    await page.getByTestId("unit-redeem-send").click();
    await expect(page.getByText("ขอรหัสบ่อยเกินไป")).toBeVisible();
    await page.goto("/link/unit?code=OWN-MISMATCH-1");
    await page.getByTestId("unit-redeem-send").click();
    await page.keyboard.type("123456");
    await expect(page.getByTestId("unit-redeem-closed")).toHaveAttribute("data-problem", "partyMismatch");
    await page.goto("/link/unit?code=OWN-OK-9");
    await page.getByTestId("unit-redeem-send").click();
    await page.keyboard.type("000000");
    await expect(page.getByText("รหัสหมดอายุแล้ว")).toBeVisible();
    await expect(page.getByTestId("unit-redeem-resend")).toBeVisible();
  });

  test("the invitation in six languages at 360 × 780 with no sideways scroll", async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await seedSession(context, baseURL!, subject("redeem", "locales"));
    for (const locale of ["th", "en", "my", "km", "lo", "zh"]) {
      await context.addCookies([{ name: "gp_locale", value: locale, url: baseURL! }]);
      await page.goto("/link/unit?code=OWN-OK-1");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByTestId("unit-redeem-preview")).toContainText("C-1203");
      await checkPage(page);
    }
  });
});
