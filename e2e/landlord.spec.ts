import { expect, test } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, fakeLiff, sessionCookieNames, subject } from "./support";

/**
 * L5 5.3 — a landlord's quick actions in LINE (D-251): the LIFF entry signs in with the LINE identity linked in the
 * web console (operator audience, its own cookies and tenant); today's items; reply to an enquiry, confirm a viewing,
 * send a rent reminder. LINE not linked, or an apartment's operator, get pointed to the web console.
 */
test.describe("landlord quick actions (D-251)", () => {
  test("signs in from LINE, confirms a viewing, reminds overdue rent and replies to an enquiry", async ({
    page,
    context,
    baseURL,
  }) => {
    await fakeLiff(context, baseURL!, { sub: subject("landlord"), name: "สมใจ" });
    await page.goto(`/liff?liff.state=${encodeURIComponent("/landlord")}`);
    await expect(page).toHaveURL(/\/landlord$/);
    expect(await sessionCookieNames(context)).toEqual(["__Host-gp_lat", "__Host-gp_lrt", "__Host-gp_ltid"]);
    const home = page.getByTestId("landlord-home");
    await expect(home.getByRole("heading", { level: 1 })).toHaveText("วันนี้ของคุณ");
    await expect(page.getByTestId("landlord-leads")).toContainText("Daniel K.");
    await expect(page.getByTestId("landlord-payments")).toContainText("฿15,000.00");
    await expect(page.getByTestId("landlord-ending")).toContainText("77/3");
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    const viewings = page.getByTestId("landlord-viewings");
    await viewings.getByTestId("viewing-confirm").click();
    await expect(viewings).toContainText("ไม่มีนัดที่รอยืนยัน");

    const overdue = page.getByTestId("landlord-overdue");
    await overdue.getByRole("button", { name: "ส่งข้อความเตือน" }).click();
    await expect(overdue.getByRole("button", { name: "ส่งข้อความเตือนทาง LINE แล้ว" })).toBeDisabled();

    await page.getByTestId("landlord-lead").first().click();
    await expect(page).toHaveURL(/\/landlord\/leads\/[0-9a-f-]+$/);
    await expect(page.getByTestId("lead-viewing")).toHaveAttribute("data-state", "confirmed");
    await page.getByLabel("ข้อความถึงผู้สนใจ").fill("ห้องยังว่างค่ะ เสาร์นี้ 10 โมงสะดวกไหมคะ");
    await page.getByTestId("lead-send").click();
    await expect(page.locator('[data-testid="lead-message"][data-author="owner"]')).toContainText("เสาร์นี้ 10 โมง");
    await expectAxeClean(page);

    await page.getByRole("link", { name: "กลับไปหน้าวันนี้" }).click();
    await expect(page.getByTestId("landlord-leads")).toContainText("ตอบครบแล้ว");
  });

  test("declines a viewing with the reason the prospect reads", async ({ page, context, baseURL }) => {
    await fakeLiff(context, baseURL!, { sub: subject("landlord", "decline"), name: "สมใจ" });
    await page.goto(`/liff?liff.state=${encodeURIComponent("/landlord")}`);
    const viewings = page.getByTestId("landlord-viewings");
    await viewings.getByTestId("viewing-decline").click();
    await expect(viewings.getByTestId("viewing-decline-send")).toBeDisabled();
    await viewings.getByLabel("เหตุผล (ไม่บังคับ)").fill("ช่วงเช้าไม่สะดวก ขอเป็นบ่ายได้ไหมคะ");
    await viewings.getByTestId("viewing-decline-send").click();
    await expect(viewings).toContainText("ไม่มีนัดที่รอยืนยัน");
  });

  test("LINE not linked yet: says how to link it in the web console", async ({ page, context, baseURL }) => {
    await fakeLiff(context, baseURL!, { sub: subject("unlinked"), name: "Somchai" });
    await page.goto(`/liff?liff.state=${encodeURIComponent("/landlord")}`);
    await expect(page).toHaveURL(/\/landlord\/sign-in\?reason=not_linked$/);
    await expect(page.getByTestId("landlord-not-linked")).toContainText("ตั้งค่า › วิธีเข้าสู่ระบบ");
    await expectAxeClean(page);
  });

  test("an apartment's operator is pointed to the web console", async ({ page, context, baseURL }) => {
    await fakeLiff(context, baseURL!, { sub: subject("apartment"), name: "Somchai" });
    await page.goto(`/liff?liff.state=${encodeURIComponent("/landlord")}`);
    await expect(page.getByTestId("landlord-not-landlord")).toContainText("คอนโซลบนเว็บ");
  });

  test("outside LINE without a session: the open-in-LINE page", async ({ page }) => {
    await page.goto("/landlord");
    await expect(page).toHaveURL(/\/landlord\/sign-in\?next=%2Flandlord$/);
    await expect(page.getByTestId("landlord-open-in-line")).toBeVisible();
  });
});
