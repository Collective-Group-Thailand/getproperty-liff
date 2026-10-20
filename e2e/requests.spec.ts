import { expect, test } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, PNG_1PX, seedSession, subject } from "./support";

/**
 * L4 4.1 — service requests on the contract mocks (360 × 780, axe on every step): report with photos (presigned
 * upload), the request page with its status timeline, SLA, planned visit and thread, cancel before work starts,
 * and the rating that closes a done request.
 */
test.describe("service requests (D-072)", () => {
  test("reports a problem with two photos and follows it", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("norequests"));
    await page.goto("/");
    await page.getByRole("link", { name: "แจ้งซ่อม" }).first().click();
    await expect(page).toHaveURL(/\/requests$/);
    await expect(page.getByText("ยังไม่มีเรื่องแจ้งซ่อม")).toBeVisible();
    await expectAxeClean(page);

    await page.getByTestId("request-new").click();
    const form = page.getByTestId("request-form");
    await expect(form.getByTestId("request-category").locator("option")).toHaveCount(9);
    await form.getByTestId("request-submit").click();
    await expect(form.getByText("โปรดเลือกประเภทของปัญหา")).toBeVisible();
    await expect(form.getByText("โปรดเขียนอธิบายปัญหาสั้น ๆ")).toBeVisible();
    await expectAxeClean(page);

    await form.getByTestId("request-category").selectOption({ label: "ประปา" });
    await form.getByRole("radio", { name: "ด่วนมาก" }).click();
    await form.getByTestId("request-description").fill("น้ำรั่วใต้อ่างล้างหน้า หยดตลอดเวลา");
    await form.getByTestId("request-photos-add").click();
    await form.locator('input[type="file"]').setInputFiles([
      { name: "leak-1.png", mimeType: "image/png", buffer: PNG_1PX },
      { name: "leak-2.png", mimeType: "image/png", buffer: PNG_1PX },
    ]);
    await form.getByTestId("camera-done").click();
    await expect(form.getByTestId("request-photos-list").getByRole("listitem")).toHaveCount(2);
    await form.getByTestId("request-visit").selectOption("evening");
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    await form.getByTestId("request-submit").click();

    await expect(page).toHaveURL(/\/requests\/[0-9a-f-]+\?sent=1$/);
    await expect(page.getByTestId("request-sent")).toContainText("ส่งเรื่อง SR-");
    const detail = page.getByTestId("request-detail");
    await expect(detail).toHaveAttribute("data-status", "new");
    await expect(detail.getByText("รอได้")).toHaveCount(0);
    await expect(detail).toContainText("ด่วนมาก");
    await expect(detail).toContainText("ช่วงเย็น");
    await expect(page.getByTestId("request-photos").getByRole("listitem")).toHaveCount(2);
    await expect(page.getByTestId("request-timeline").getByRole("listitem")).toHaveCount(1);
    await expect(page.getByTestId("request-sla")).toHaveAttribute("data-state", "on_track");

    // The photo opens at full size with zoom; Escape returns to the thumbnail.
    await page.getByTestId("request-photos").getByRole("button").first().click();
    await expect(page.getByTestId("request-photos-full")).toBeVisible();
    await expectAxeClean(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("request-photos-full")).toHaveCount(0);

    // A message to the office (never a phone number) — CONTRACT-REQUEST #23.
    await page.getByTestId("thread-input").fill("สะดวกหลัง 18:00 น. ค่ะ");
    await page.getByTestId("thread-send").click();
    await expect(page.getByTestId("thread-messages").getByRole("listitem")).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    // Cancel before work starts, with a reason.
    await page.getByTestId("request-cancel").click();
    await expect(page.getByRole("alertdialog")).toContainText("ยกเลิกเรื่องแจ้งซ่อมนี้ไหม");
    await expectAxeClean(page);
    await page.getByRole("alertdialog").getByRole("button", { name: "ยกเลิกเรื่อง" }).click();
    await expect(detail).toHaveAttribute("data-status", "cancelled");
    await expect(page.getByTestId("request-cancel")).toHaveCount(0);
    await expect(page.getByTestId("request-timeline").getByRole("listitem")).toHaveCount(2);
  });

  test("an assigned request shows the visit, which the resident confirms; a done one is rated and closed", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("rating"));
    await page.goto("/requests");
    const items = page.getByTestId("request-item");
    await expect(items).toHaveCount(3);
    await expect(page.getByRole("heading", { name: "กำลังดำเนินการ" })).toBeVisible();
    await expectAxeClean(page);

    await page.locator('[data-testid="request-item"][data-status="assigned"]').click();
    await expect(page.getByTestId("request-visit")).toContainText("นัดไว้");
    await expect(page.getByTestId("thread-messages")).toContainText("รับเรื่องแล้วค่ะ");
    await page.getByTestId("request-confirm-visit").click();
    await expect(page.getByTestId("request-visit-confirmed")).toBeVisible();
    await expect(page.getByTestId("request-cancel")).toHaveCount(0);
    await expectAxeClean(page);

    await page.goto("/requests");
    await page.locator('[data-testid="request-item"][data-status="done"]').click();
    const rate = page.getByTestId("request-rate");
    await rate.getByTestId("request-rate-submit").click();
    await expect(rate.getByText("โปรดเลือก 1 ถึง 5 ดาว")).toBeVisible();
    await expectAxeClean(page);
    await rate.locator("label", { has: page.getByRole("radio", { name: "4 ดาว" }) }).click();
    await rate.getByTestId("request-rate-comment").fill("ช่างสุภาพ แต่มาช้านิดหน่อย");
    await rate.getByTestId("request-rate-submit").click();
    await expect(page.getByTestId("request-detail")).toHaveAttribute("data-status", "closed");
    await expect(page.getByTestId("request-rating")).toContainText("คุณให้ 4 ดาว");
    await expect(page.getByTestId("request-rate")).toHaveCount(0);
    await expect(page.getByTestId("thread-input")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  });

  test("a unit under the developer's warranty is referred, as the API says (D-153)", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("warranty", "norequests"));
    await page.goto("/requests/new");
    const form = page.getByTestId("request-form");
    await form.getByTestId("request-category").selectOption({ label: "โครงสร้าง ประตู หน้าต่าง" });
    await form.getByTestId("request-description").fill("ผนังห้องน้ำร้าว");
    await form.getByTestId("request-submit").click();
    await expect(page.getByTestId("request-warranty")).toContainText("ส่งต่อให้โครงการตามการรับประกัน");
    await expect(page.getByTestId("request-sla")).toHaveCount(0);
    await expectAxeClean(page);
  });

  test("a landlord without the module has no repairs menu", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("nocommunity"));
    await page.goto("/");
    await expect(page.getByRole("link", { name: "แจ้งซ่อม" })).toHaveCount(0);
    expect((await page.goto("/requests"))?.status()).toBe(404);
  });
});
