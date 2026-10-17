import { expect, test } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, seedSession, subject } from "./support";

/** L3 3.2 — deposit status and the settlement answer: deductions with before/after photos, accept or dispute. */

/** A tiny PNG standing in for a phone photo. */
const PHOTO = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("deposit settlement (D-023)", () => {
  test("shows deductions with move-in and move-out photos; disputes with a reason and photos", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("moveout"));
    await page.goto("/lease");
    await page.getByTestId("lease-deposit").click();
    const view = page.getByTestId("deposit-view");
    await expect(view.getByRole("heading", { level: 1 })).toHaveText("เงินประกัน · ห้อง A-201");
    await expect(page.getByTestId("settlement")).toContainText("฿3,349.50");
    const deductions = page.getByTestId("deductions").getByRole("listitem");
    await expect(deductions).toHaveCount(2);
    await expect(deductions.first().getByRole("img")).toHaveCount(2);
    await expect(deductions.first().getByRole("img").first()).toHaveAttribute("alt", /ตอนเข้าพัก$/);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await page.getByTestId("deposit-dispute").click();
    const form = page.getByTestId("deposit-dispute-form");
    await form.getByTestId("deposit-dispute-submit").click();
    await expect(form.getByText("โปรดเขียนอธิบายสั้น ๆ")).toBeVisible();
    await form.getByTestId("deposit-dispute-reason").fill("รอยบนผนังมีตั้งแต่ก่อนเข้าพัก ดูรูปตอนเข้าพัก");
    await form.locator('input[type="file"]').setInputFiles([
      { name: "wall-1.png", mimeType: "image/png", buffer: PHOTO },
      { name: "wall-2.png", mimeType: "image/png", buffer: PHOTO },
    ]);
    await expect(page.getByTestId("deposit-photos").getByRole("listitem")).toHaveCount(2);
    await page.getByRole("button", { name: "ลบรูปที่ 2" }).click();
    await expect(page.getByTestId("deposit-photos").getByRole("listitem")).toHaveCount(1);
    await expectAxeClean(page);
    await form.getByTestId("deposit-dispute-submit").click();

    await expect(page.getByTestId("deposit-respond")).toHaveCount(0);
    await expect(view.getByText("โต้แย้งแล้ว").first()).toBeVisible();
    await expect(page.getByTestId("settlement")).toContainText("รอยบนผนังมีตั้งแต่ก่อนเข้าพัก");
  });

  test("accepts the proposed refund after a confirmation", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("moveout"));
    await page.goto("/deposit");
    await page.getByTestId("deposit-accept").click();
    await expect(page.getByTestId("deposit-accept-confirm")).toContainText("฿3,349.50");
    await expectAxeClean(page);
    await page.getByTestId("deposit-accept-submit").click();
    await expect(page.getByTestId("settlement")).toContainText("ยอดคืนที่ตกลง");
    await expect(page.getByTestId("deposit-respond")).toHaveCount(0);
  });

  test("a deposit still held says what happens at move-out", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("held"));
    await page.goto("/deposit");
    await expect(page.getByTestId("deposit-view")).toContainText("ผู้ดูแลอาคารถือเงินประกันของคุณไว้");
    await expectAxeClean(page);
  });
});
