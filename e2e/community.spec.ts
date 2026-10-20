import { expect, test } from "@playwright/test";

import {
  expectAxeClean,
  expectNoHorizontalScroll,
  fakeLiff,
  fakeLiffRecord,
  forceProblems,
  seedSession,
  subject,
} from "./support";

/**
 * L4 4.2 — announcements with read receipts (and the LINE deep link), parcels with the pick-up code, facility
 * bookings, house rules, contacts, and door codes with my unit's unlock log — on the contract mocks, 360 × 780,
 * axe on every screen.
 */
test.describe("community and access (D-070, D-073)", () => {
  test("a LINE message opens the exact announcement, which records the read receipt", async ({
    page,
    context,
    baseURL,
  }) => {
    const sub = subject("announce");
    await seedSession(context, baseURL!, sub);
    await page.goto("/announcements");
    const items = page.getByTestId("announcement-item");
    await expect(items).toHaveCount(2);
    await expect(items.first()).toHaveAttribute("data-read", "false");
    await expect(items.first()).toContainText("ปักหมุด");
    const href = await items.first().getAttribute("href");
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);

    // The same resident opens the LINE message: liff.state carries the announcement's path.
    await fakeLiff(context, baseURL!, { sub });
    await page.goto(`/liff?liff.state=${encodeURIComponent(href!)}`);
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByTestId("announcement-detail").getByRole("heading", { level: 1 })).toHaveText(
      "งดจ่ายน้ำชั่วคราว วันเสาร์ 09:00–12:00 น.",
    );
    await expectAxeClean(page);
    await page.goto("/announcements");
    await expect(page.getByTestId("announcement-item").first()).toHaveAttribute("data-read", "true");
  });

  test("a parcel waiting at the desk shows its pick-up code big, with a QR the desk can scan", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("parcels"));
    await page.goto("/");
    await page.getByRole("link", { name: "พัสดุ" }).click();
    const waiting = page.locator('[data-testid="parcel"][data-status="notified"]');
    await expect(waiting.getByTestId("parcel-pin-code")).toHaveText("482913");
    const qr = waiting.getByTestId("parcel-pin-qr");
    await expect(qr).toHaveAttribute("aria-label", "คิวอาร์โค้ดของรหัสรับพัสดุ 482913");
    const box = await qr.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(200);
    await expect(page.locator('[data-testid="parcel"][data-status="picked_up"]')).not.toContainText("482913");
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test("books a free slot, sees a taken one, and cancels the booking", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("booking"));
    await page.goto("/facilities");
    await expect(page.getByTestId("facility-item")).toHaveCount(2);
    await expectAxeClean(page);
    await page.getByTestId("facility-item").first().click();
    // Tomorrow 18:00 is someone else's (busy, not named).
    await page.getByTestId("facility-day").nth(1).click();
    await expect(page.locator('[data-testid="slot"][data-state="busy"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="slot"][data-state="busy"]')).toBeDisabled();
    await page.locator('[data-testid="slot"][data-state="free"]').first().click();
    await expect(page.getByTestId("booking-form")).toBeVisible();
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    await page.getByTestId("booking-submit").click();
    await expect(page.getByTestId("booking-done")).toContainText("จองแล้ว");
    await expect(page.locator('[data-testid="slot"][data-state="mine"]')).toHaveCount(1);

    await page.goto("/facilities");
    const booking = page.locator('[data-testid="booking"][data-status="confirmed"]');
    await expect(booking).toHaveCount(1);
    await booking.getByTestId("booking-cancel").click();
    await expect(page.getByRole("alertdialog")).toContainText("ห้องประชุมชั้น 2");
    await page.getByRole("alertdialog").getByRole("button", { name: "ยกเลิกการจอง" }).click();
    await expect(page.locator('[data-testid="booking"][data-status="cancelled"]')).toHaveCount(1);
  });

  test("acknowledges the house rules and calls or chats with the office", async ({ page, context, baseURL }) => {
    await fakeLiff(context, baseURL!, { sub: subject("rules") });
    await page.goto("/liff?liff.state=%2Frules");
    await expect(page.getByTestId("rules-body")).toContainText("งดส่งเสียงดัง");
    await expect(page.getByTestId("building-rules-submit")).toBeDisabled();
    await page.getByTestId("building-rules-check").click();
    await page.getByTestId("building-rules-submit").click();
    await expect(page.getByTestId("rules-acknowledged")).toBeVisible();
    await expectAxeClean(page);

    await page.goto("/contacts");
    const emergency = page.locator('[data-testid="contact"][data-kind="emergency"]');
    await expect(emergency.first().getByTestId("contact-call")).toHaveAttribute("href", "tel:191");
    const office = page.locator('[data-testid="contact"][data-kind="building"]');
    await office.getByTestId("contact-line").click();
    await expect
      .poll(async () => (await fakeLiffRecord(page)).opened.map((o) => o.url))
      .toContain("https://line.me/R/ti/p/@getproperty-a");
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test("shows my door codes only when asked, my unit's unlock log, and a visitor code", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("access"));
    await page.goto("/access");
    await expect(page.getByTestId("access-pin")).toHaveCount(0);
    await expect(page.getByTestId("unlock-table").locator("tbody tr")).toHaveCount(5);
    await expect(page.locator('[data-testid="unlock-table"] tr[data-result="denied"]')).toHaveCount(1);
    await expectAxeClean(page);

    await page.getByTestId("access-show").click();
    await expect(page.getByTestId("access-pin")).toHaveText(["246810", "135790"]);
    // The operator allows visitor codes of up to 12 hours (`visitorPolicy`, D-218): no longer choice is offered.
    await expect(page.getByTestId("visitor-code")).toContainText("12 ชั่วโมง");
    await expect(page.getByTestId("visitor-hours").locator("option")).toHaveText([
      "2 ชั่วโมง",
      "4 ชั่วโมง",
      "8 ชั่วโมง",
      "12 ชั่วโมง",
    ]);
    await page.getByTestId("visitor-submit").click();
    await expect(page.getByText("โปรดใส่ชื่อผู้มาเยือน")).toBeVisible();
    await page.getByTestId("visitor-name").fill("คุณแม่");
    await page.getByTestId("visitor-hours").selectOption("12");
    await page.getByTestId("visitor-submit").click();
    await expect(page.getByTestId("visitor-created")).toContainText("รหัสสำหรับ คุณแม่");
    await expect(page.getByTestId("visitor-pin")).toHaveText(/^\d{6}$/);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
    await page.getByTestId("access-hide").click();
    await expect(page.getByTestId("access-pin")).toHaveCount(0);
  });

  test("a unit without smart locks has no door-code menu (the `access` entitlement, D-218)", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("nolocks"));
    await page.goto("/");
    await expect(page.getByTestId("resident-home")).toBeVisible();
    await expect(page.getByRole("link", { name: "จองห้องส่วนกลาง" })).toBeVisible();
    await expect(page.locator('a[href="/access"]')).toHaveCount(0);
    expect((await page.goto("/access"))?.status()).toBe(404);
  });

  test("where the operator does not offer visitor codes the resident is told so, kindly", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("novisitor"));
    await page.goto("/access");
    await page.getByTestId("access-show").click();
    await expect(page.getByTestId("access-pin")).toHaveCount(2);
    await expect(page.getByTestId("visitor-code")).toHaveCount(0);
    await expect(page.getByTestId("visitor-disabled")).toContainText(
      "อาคารของคุณไม่เปิดให้ผู้พักอาศัยสร้างรหัสผู้มาเยือน โปรดติดต่อสำนักงาน",
    );
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test("an operator who turns visitor codes off meanwhile gets the same kind state (403)", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("visitor-race"));
    await forceProblems(context, baseURL!, { "resident.access.visitorCode": "access.visitor_codes_disabled" });
    await page.goto("/access");
    await page.getByTestId("access-show").click();
    await page.getByTestId("visitor-name").fill("ช่างแอร์");
    await page.getByTestId("visitor-submit").click();
    await expect(page.getByTestId("visitor-disabled")).toBeVisible();
    await expect(page.getByTestId("visitor-code")).toHaveCount(0);
    // No problem callout: the refusal is the same kind state, not an error.
    await expect(page.getByTestId("access-codes").getByRole("alert")).toHaveCount(0);
    await expectAxeClean(page);
  });
});
