import { expect, test } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, seedSession, subject } from "./support";

/** L3 3.3 — usage charts with table fallbacks, profile (language, notifications, documents) and privacy. */

test.describe("usage (D-063)", () => {
  test("charts per utility with the previous period, a data table for each, the API's totals and estimate", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("usage"));
    await page.goto("/usage");
    await expect(page.getByTestId("usage-range-7d")).toHaveAttribute("aria-current", "page");
    for (const utility of ["electric", "water"]) {
      await expect(page.getByTestId(`usage-chart-${utility}`)).toBeVisible();
      await expect(page.getByTestId(`usage-summary-${utility}`)).toBeVisible();
      await expect(page.getByTestId(`usage-estimate-${utility}`)).toContainText("ประมาณการ");
    }
    const chart = page.getByTestId("usage-chart-electric");
    await expect(chart).toHaveAttribute("role", "img");
    await expect(chart).toHaveAttribute("aria-label", /ตัวเลขอยู่ในตารางด้านล่าง/);

    const toggle = page.getByTestId("usage-table-toggle-electric");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("usage-table-electric")).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const table = page.getByTestId("usage-table-electric");
    await expect(table.getByRole("columnheader")).toHaveText(["วัน", "7 วันล่าสุด", "7 วันก่อนหน้า"]);
    await expect(table.locator("tbody tr")).toHaveCount(7);
    await expect(table.locator("tbody tr").first().getByRole("cell").first()).toHaveText(/kWh$/);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await page.getByTestId("usage-range-30d").click();
    await expect(page.getByTestId("usage-range-30d")).toHaveAttribute("aria-current", "page");
    await page.getByTestId("usage-table-toggle-water").click();
    await expect(page.getByTestId("usage-table-water").locator("tbody tr")).toHaveCount(30);
    await page.getByTestId("usage-range-24h").click();
    await page.getByTestId("usage-table-toggle-water").click();
    await expect(page.getByTestId("usage-table-water").locator("tbody tr")).toHaveCount(24);
  });

  test("without IoT meters the screen explains the manual reading", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("manual"));
    await page.goto("/usage");
    await expect(page.getByTestId("usage-manual")).toContainText("จดโดยเจ้าหน้าที่");
    // No usage tile or tab for a unit without smart meters.
    await expect(page.getByRole("navigation", { name: "เมนูด่วน" }).getByRole("link")).toHaveText([
      "หน้าแรก",
      "บิล",
      "แจ้งซ่อม",
      "ฉัน",
    ]);
    await expectAxeClean(page);
  });
});

test.describe("profile and privacy (D-025, D-064)", () => {
  test("language switch persists through the API and the cookie", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("profile"));
    await page.goto("/profile");
    const profile = page.getByTestId("profile");
    await expect(profile).toContainText("081-000-1234");
    await expect(page.getByTestId("profile-line")).toHaveText("เชื่อมกับบัญชีนี้แล้ว");
    await expect(page.getByTestId("profile-documents")).toContainText("สัญญาเช่า");
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await page.getByTestId("profile-language").selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("My profile");
    const me = await page.request.get("/bff/v1/resident/me");
    expect((await me.json()).user.language).toBe("en");
    expect((await context.cookies()).find((c) => c.name === "gp_locale")?.value).toBe("en");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("notification preferences: locked topics stay on; others save", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("notify"));
    await page.goto("/profile");
    const prefs = page.getByTestId("notification-preferences");
    const billing = prefs.getByRole("group", { name: "บิลและการชำระเงิน" });
    await expect(billing.getByRole("checkbox", { name: "SMS" })).toBeDisabled();
    await expect(page.getByTestId("notifications-save")).toBeDisabled();
    await prefs.getByRole("group", { name: "ประกาศ" }).getByRole("checkbox", { name: "SMS" }).click();
    await page.getByTestId("notifications-save").click();
    await expect(page.getByText("บันทึกการตั้งค่าการแจ้งเตือนแล้ว")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("group", { name: "ประกาศ" }).getByRole("checkbox", { name: "SMS" })).toHaveAttribute(
      "data-state",
      "checked",
    );
  });

  test("consent: grant and withdraw an optional purpose; withdrawing the required one asks again", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("privacy"));
    await page.goto("/profile");
    await page.getByTestId("profile-privacy").click();
    await expect(page.getByTestId("privacy-controllers")).toContainText("ชื่อ");
    await expectAxeClean(page);

    const marketing = page.locator('[data-purpose="resident.marketing"]');
    await marketing.getByTestId("consent-grant-resident.marketing").click();
    await expect(marketing).toContainText("ให้ความยินยอมเมื่อ");
    await marketing.getByTestId("consent-withdraw-resident.marketing").click();
    await expect(marketing.getByTestId("consent-withdraw-confirm")).toBeVisible();
    await expectAxeClean(page);
    await marketing.getByTestId("consent-withdraw-submit").click();
    await expect(marketing).toContainText("ถอนความยินยอมเมื่อ");

    const service = page.locator('[data-purpose="resident.service"]');
    await service.getByTestId("consent-withdraw-resident.service").click();
    await expect(service.getByRole("alert")).toContainText("จำเป็นต่อการใช้แอป");
    await service.getByTestId("consent-withdraw-submit").click();
    await expect(page).toHaveURL(/\/consent\?next=%2Fprofile%2Fprivacy$/);
  });

  test("files a PDPA request and lists it with its due date", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("dsr"));
    await page.goto("/profile/privacy");
    const form = page.getByTestId("dsr-form");
    await form.getByTestId("dsr-submit").click();
    await expect(form.getByRole("alert")).toContainText("โปรดเลือกหนึ่งข้อ");
    await form.getByRole("radio", { name: /ขอสำเนาข้อมูลของฉัน/ }).check();
    await form.getByRole("textbox").fill("ขอสำเนาข้อมูลทั้งหมด");
    await form.getByTestId("dsr-submit").click();
    await expect(page.getByTestId("dsr-sent")).toBeVisible();
    await expect(page.getByTestId("dsr-list")).toContainText("ขอสำเนาข้อมูลของฉัน");
    await expect(page.getByTestId("dsr-list")).toContainText("ครบกำหนด");
    await expectAxeClean(page);
  });
});
