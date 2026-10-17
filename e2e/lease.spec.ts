import { expect, test, type Page } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, fakeLiff, seedSession, subject } from "./support";

/**
 * L3 3.1 / 3.2 — the lease viewer, the e-signature (read to the end → draw or upload → SMS code → signed with the
 * document hash), building rules acknowledgement and the 30-day move-out notice, on the contract mocks at 360 × 780.
 */

/** A 1×1 PNG: the "photo of my signature" for the upload alternative. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function readToTheEnd(page: Page) {
  const reader = page.getByTestId("sign-reader");
  await expect(page.getByTestId("sign-read-next")).toBeDisabled();
  // Keyboard path: the reader is focusable and scrolls with End.
  await reader.focus();
  await page.keyboard.press("End");
  await reader.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.getByRole("checkbox", { name: "ฉันอ่านสัญญาเช่าทั้งหมดแล้วและตกลงตามสัญญา" }).click();
  await page.getByTestId("sign-read-next").click();
}

test.describe("lease and e-signature (D-062)", () => {
  test("inside LINE (fake LIFF): read, draw, paste the SMS code, signed with the document hash", async ({
    page,
    context,
    baseURL,
  }) => {
    await fakeLiff(context, baseURL!, { sub: subject("signer") });
    await page.goto("/liff?liff.state=%2Flease");
    // One lease: the list goes straight to it.
    await expect(page).toHaveURL(/\/lease\/[0-9a-f-]{36}$/, { timeout: 20_000 });
    const view = page.getByTestId("lease-view");
    await expect(view.getByRole("heading", { level: 1 })).toHaveText("สัญญาเช่า · ห้อง A-201");
    await expect(view.getByText("รอลงนาม", { exact: true })).toBeVisible();
    await expect(page.getByTestId("lease-parties")).toContainText("ผู้เช่าร่วม");
    await expect(page.getByTestId("lease-rules")).toContainText("ระเบียบอาคาร");
    // Rules are acknowledged after signing, not before.
    await expect(page.getByTestId("rules-form")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await page.getByTestId("lease-sign").click();
    await expect(page.getByTestId("sign-flow")).toHaveAttribute("data-step", "read");
    await expect(page.getByTestId("sign-progress")).toHaveText("ขั้นที่ 1 จาก 3");
    await expectAxeClean(page);
    await readToTheEnd(page);

    await expect(page.getByTestId("sign-flow")).toHaveAttribute("data-step", "draw");
    await expect(page.getByTestId("sign-draw-next")).toBeDisabled();
    const pad = page.getByTestId("signature-pad");
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + 30, box.y + 60);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + 100, { steps: 5 });
    await page.mouse.move(box.x + 160, box.y + 50, { steps: 5 });
    await page.mouse.up();
    await expect(pad).toHaveAttribute("data-empty", "false");
    await expectAxeClean(page);
    await page.getByTestId("sign-draw-next").click();

    await expect(page.getByTestId("sign-otp-lead")).toContainText("08•-•••-1234");
    // Paste the whole code into the first box (the OS SMS autofill does the same).
    await page.getByRole("textbox", { name: "หลักที่ 1" }).fill("123456");
    const done = page.getByTestId("sign-done");
    await expect(done).toBeVisible();
    await expect(page.getByTestId("sign-hash")).toHaveText(/^[0-9a-f]{64}$/);
    await expect(done).toContainText("รอผู้ดูแลอาคาร");
    await expectAxeClean(page);

    await done.getByRole("link", { name: "กลับไปที่สัญญาเช่า" }).click();
    await expect(page.getByTestId("lease-waiting")).toBeVisible();
    await expect(page.getByTestId("lease-sign")).toHaveCount(0);
  });

  test("plain web page: the upload alternative by keyboard, a wrong code says how many tries are left", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("signer"));
    await page.goto("/lease");
    await page.getByTestId("lease-sign").click();
    await readToTheEnd(page);

    // WCAG 2.5.7: the signature without dragging — Tab to "use a photo", Enter, choose the file.
    const upload = page.getByRole("button", { name: "ใช้รูปลายเซ็นของฉัน" });
    await upload.focus();
    const chooser = page.waitForEvent("filechooser");
    await page.keyboard.press("Enter");
    await (await chooser).setFiles({ name: "signature.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByTestId("signature-pad")).toHaveAttribute("data-empty", "false");
    await page.getByTestId("sign-draw-next").focus();
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("sign-otp-lead")).toContainText("1234");
    await page.getByRole("textbox", { name: "หลักที่ 1" }).fill("654321");
    await expect(page.getByText("รหัสไม่ถูกต้อง ลองได้อีก 4 ครั้ง")).toBeVisible();
    await expectAxeClean(page);
    await page.getByRole("textbox", { name: "หลักที่ 1" }).fill("123456");
    await expect(page.getByTestId("sign-done")).toBeVisible();
  });

  test("building rules acknowledgement on a lease in force", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("rules"));
    await page.goto("/lease");
    const form = page.getByTestId("rules-form");
    await expect(form.getByTestId("rules-submit")).toBeDisabled();
    await form.getByRole("checkbox", { name: "ฉันอ่านระเบียบอาคารแล้ว" }).click();
    await form.getByTestId("rules-submit").click();
    await expect(page.getByTestId("rules-acknowledged")).toBeVisible();
    await expectAxeClean(page);
  });
});

test.describe("move-out notice (D-020)", () => {
  test("a date before the API's earliest is refused with its legal reference; the earliest date is recorded", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("notice"));
    await page.goto("/lease");
    await page.getByTestId("lease-notice").click();
    const form = page.getByTestId("notice-form");
    const date = page.getByTestId("notice-date");
    const earliest = await date.getAttribute("min");
    expect(earliest).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(date).toHaveValue(earliest!);
    await expectAxeClean(page);

    // Ten days from now: the API refuses (ข้อ 4 (11)); the app shows why, never works around it.
    const tooEarly = new Date(Date.now() + 10 * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
    await date.fill(tooEarly);
    await page.getByTestId("notice-review").click();
    await expect(page.getByTestId("notice-confirm")).toContainText("A-201");
    await page.getByTestId("notice-submit").click();
    const refusal = form.getByRole("alert").filter({ hasText: "อ้างอิงกฎหมาย" });
    await expect(refusal).toBeVisible();
    await expectAxeClean(page);

    await date.fill(earliest!);
    await page.getByTestId("notice-review").click();
    await page.getByTestId("notice-submit").click();
    await expect(page.getByTestId("notice-done")).toContainText("A-201");
    await page.getByRole("link", { name: "กลับไปที่สัญญาเช่า" }).click();
    await expect(page.getByTestId("lease-view")).toContainText("แจ้งย้ายออกแล้ว");
    await expect(page.getByTestId("lease-notice")).toHaveCount(0);
  });
});
