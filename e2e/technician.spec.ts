import { expect, test, type Page } from "@playwright/test";

import {
  expectAxeClean,
  expectNoHorizontalScroll,
  fakeLiff,
  PNG_1PX,
  seedSession,
  sessionCookieNames,
  subject,
} from "./support";

/**
 * L4 4.4 — technicians (audience `technician`, FEATURE_TECHNICIAN=1 in this suite): LINE sign-in through the same
 * LIFF entry, SMS sign-in outside LINE, my work orders by schedule, accept → check in → before photos → waiting for
 * parts → resume → cost line → after photos → complete; guards both ways; and the whole loop with a resident on the
 * mocks — the resident files, the owner assigns (mock control), the technician completes with photos, the resident
 * rates and the technician sees the rating.
 */

async function addPhotos(page: Page, role: "before" | "after", count: number) {
  const section = page.getByTestId(`wo-photos-${role}`);
  await section.getByTestId(`wo-picker-${role}-add`).click();
  await section.locator('input[type="file"]').setInputFiles(
    Array.from({ length: count }, (_, i) => ({
      name: `${role}-${i + 1}.png`,
      mimeType: "image/png",
      buffer: PNG_1PX,
    })),
  );
  await section.getByTestId("camera-done").click();
  await section.getByTestId(`wo-send-${role}`).click();
  await expect(section.getByTestId(`wo-sent-${role}`)).toBeVisible();
}

test.describe("technician app (D-072, D-210)", () => {
  test("signs in with LINE as a technician and works a job from accept to complete", async ({
    page,
    context,
    baseURL,
  }) => {
    await fakeLiff(context, baseURL!, { sub: subject("tech"), name: "ช่างสมชาย" });
    await page.goto("/liff?liff.state=%2Ftechnician");
    await expect(page).toHaveURL(/\/technician$/);
    expect(await sessionCookieNames(context)).toEqual(["__Host-gp_tat", "__Host-gp_trt"]);
    const home = page.getByTestId("technician-home");
    await expect(home.getByRole("heading", { level: 1 })).toHaveText("งานของฉัน");
    await expect(home.getByRole("heading", { name: "วันนี้" })).toBeVisible();
    await expect(page.getByTestId("work-order-item")).toHaveCount(2);
    // No resident navigation in the technician frame.
    await expect(page.getByRole("navigation", { name: "เมนูด่วน" })).toHaveCount(0);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);

    await page.locator('[data-testid="work-order-item"][data-status="assigned"]').click();
    const wo = page.getByTestId("work-order");
    await expect(wo).toContainText("ก๊อกน้ำอ่างล้างหน้ารั่ว");
    await expect(page.getByTestId("wo-gallery-report").getByRole("listitem")).toHaveCount(1);
    await expectAxeClean(page);

    await page.getByTestId("wo-door-codes-show").click();
    await expect(page.getByTestId("wo-door-codes")).toContainText("731905");

    await page.getByTestId("wo-accept").click();
    await expect(wo).toHaveAttribute("data-status", "accepted");
    await page.getByTestId("wo-check-in").click();
    await expect(wo).toHaveAttribute("data-status", "in_progress");
    await expect(page.getByTestId("wo-needs-photo")).toBeVisible();

    await addPhotos(page, "before", 2);
    await expect(page.getByTestId("wo-gallery-before").getByRole("listitem")).toHaveCount(2);

    await page.getByTestId("wo-wait-parts").click();
    await page.getByTestId("wo-note").fill("ต้องเปลี่ยนวาล์วน้ำ");
    await page.getByTestId("wo-wait-parts-submit").click();
    await expect(page.getByTestId("wo-resume")).toBeVisible();
    await expect(page.getByTestId("wo-complete")).toHaveCount(0);
    await page.getByTestId("wo-resume").click();

    const costs = page.getByTestId("cost-form");
    await costs.getByTestId("cost-submit").click();
    await expect(costs.getByText("โปรดระบุรายการ")).toBeVisible();
    await costs.getByTestId("cost-description").fill("วาล์วน้ำ");
    await costs.getByTestId("cost-quantity").fill("2");
    await costs.getByTestId("cost-price").fill("175.50");
    await costs.getByTestId("cost-submit").click();
    await expect(page.getByTestId("cost-lines").locator("tbody tr")).toHaveCount(1);
    await expect(page.getByTestId("cost-total")).toContainText("351.00");

    // Completing without an after photo is refused by the API (422 work_order.photo_required).
    await page.getByTestId("wo-complete").click();
    await page.getByTestId("wo-complete-submit").click();
    await expect(page.getByTestId("wo-actions")).toContainText("ต้องมีภาพหลังซ่อม");
    await addPhotos(page, "after", 1);
    // The note form stays open after the refusal; the photo is there now.
    await page.getByTestId("wo-note").fill("เปลี่ยนวาล์วและก๊อกแล้ว ทดสอบไม่รั่ว");
    await page.getByTestId("wo-complete-submit").click();
    await expect(wo).toHaveAttribute("data-status", "done");
    await expect(page.getByTestId("wo-rating")).toContainText("ผู้พักอาศัยยังไม่ได้ให้คะแนนงานนี้");
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
  });

  test("signs in by SMS code outside LINE", async ({ page }) => {
    await page.goto("/technician");
    await expect(page).toHaveURL(/\/technician\/sign-in\?next=%2Ftechnician$/);
    await expectAxeClean(page);
    await page.getByLabel("เบอร์มือถือ").fill("0812345678");
    await page.getByTestId("technician-send-code").click();
    const otp = page.getByTestId("technician-otp");
    await expect(otp).toContainText("081-234-5678");
    await otp.getByRole("textbox").first().fill("000001");
    await expect(otp).toContainText("เหลือ 4 ครั้ง");
    await otp.getByRole("textbox").first().fill("123456");
    await expect(page).toHaveURL(/\/technician$/);
    await expect(page.getByTestId("work-order-item")).toHaveCount(2);
    await expectAxeClean(page);
  });

  test("residents never reach technician screens, technicians never reach resident ones", async ({
    page,
    context,
    baseURL,
  }) => {
    // A resident session does not open /technician: the technician sign-in asks for their own.
    await seedSession(context, baseURL!, subject("guard-resident"));
    await page.goto("/technician");
    await expect(page).toHaveURL(/\/technician\/sign-in/);
    await page.goto("/");
    await expect(page.getByTestId("resident-home")).toBeVisible();
    await context.clearCookies();

    // A technician session does not open resident screens: the resident sign-in asks for a resident's.
    await fakeLiff(context, baseURL!, { sub: subject("tech", "guard"), inClient: false, os: "web" });
    await page.goto("/liff?liff.state=%2Ftechnician");
    await expect(page).toHaveURL(/\/technician$/);
    await page.goto("/requests");
    await expect(page).toHaveURL(/\/auth\?next=%2Frequests$/);
    // A work order that is not mine is the API's 404.
    await page.goto("/technician/work-orders/3b241101-e2bb-4255-8caf-4136c566a962");
    await expect(page.getByRole("heading", { name: "ไม่พบข้อมูล" })).toBeVisible();
  });

  test("the loop: a resident files, the office assigns, the technician completes with photos, the resident rates", async ({
    browser,
    baseURL,
  }) => {
    const residentContext = await browser.newContext({ viewport: { width: 360, height: 780 }, baseURL });
    const technicianContext = await browser.newContext({ viewport: { width: 360, height: 780 }, baseURL });
    const resident = await residentContext.newPage();
    const technician = await technicianContext.newPage();
    const techSub = subject("crew");
    await seedSession(residentContext, baseURL!, subject("loop", "norequests"));

    await resident.goto("/requests/new");
    const form = resident.getByTestId("request-form");
    await form.getByTestId("request-category").selectOption({ label: "ไฟฟ้า" });
    await form.getByTestId("request-description").fill("ไฟห้องนอนกะพริบ");
    await form.getByTestId("request-photos-add").click();
    await form
      .locator('input[type="file"]')
      .setInputFiles([{ name: "lamp.png", mimeType: "image/png", buffer: PNG_1PX }]);
    await form.getByTestId("camera-done").click();
    await form.getByTestId("request-submit").click();
    await expect(resident).toHaveURL(/\/requests\/[0-9a-f-]+\?sent=1$/);
    const requestId = /\/requests\/([0-9a-f-]+)/.exec(resident.url())![1]!;

    // The office triages and assigns (mock control playing the owner's console).
    const origin = new URL(resident.url()).origin;
    const assigned = await resident.request.post(`/bff/v1/resident/__mock/service-requests/${requestId}/assign`, {
      headers: { "x-getproperty-csrf": "1", origin },
      data: { technician: techSub },
    });
    expect(assigned.status(), await assigned.text()).toBe(200);
    await resident.reload();
    await expect(resident.getByTestId("request-detail")).toHaveAttribute("data-status", "assigned");

    await fakeLiff(technicianContext, baseURL!, { sub: techSub });
    await technician.goto("/liff?liff.state=%2Ftechnician");
    await technician.getByTestId("technician-refresh").click();
    await technician.getByTestId("work-order-item").first().click();
    await expect(technician.getByTestId("work-order")).toContainText("ไฟห้องนอนกะพริบ");
    await technician.getByTestId("wo-check-in").click();
    await expect(technician.getByTestId("work-order")).toHaveAttribute("data-status", "in_progress");
    await addPhotos(technician, "after", 1);
    await technician.getByTestId("wo-complete").click();
    await technician.getByTestId("wo-complete-submit").click();
    await expect(technician.getByTestId("work-order")).toHaveAttribute("data-status", "done");

    await resident.reload();
    await expect(resident.getByTestId("request-detail")).toHaveAttribute("data-status", "done");
    await expect(resident.getByTestId("request-after-photos").getByRole("listitem")).toHaveCount(1);
    await resident
      .getByTestId("request-rate")
      .locator("label", { has: resident.getByRole("radio", { name: "5 ดาว" }) })
      .click();
    await resident.getByTestId("request-rate-submit").click();
    await expect(resident.getByTestId("request-detail")).toHaveAttribute("data-status", "closed");

    await technician.reload();
    await expect(technician.getByTestId("wo-rating")).toContainText("5 ดาว");
    await residentContext.close();
    await technicianContext.close();
  });
});
