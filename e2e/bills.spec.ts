import { gzipSync } from "node:zlib";

import { expect, test, type Page, type Response } from "@playwright/test";

import {
  expectAxeClean,
  expectNoHorizontalScroll,
  fakeLiff,
  fakeLiffRecord,
  mockOwnerDecidesHeld,
  mockProviderPays,
  seedSession,
  slipImage,
  subject,
} from "./support";

/**
 * L2 — home on real data, invoices (open first, history by period), invoice detail (lines by source, readings,
 * source badges, meter photo, units × price per unit, "invoice explained" with the legal reference), the pay sheet
 * (Thai QR, save / banking-app helpers, validity countdown, SSE → paid → receipt), the slip fallback with its
 * verification outcomes, receipts (PDF, share to LINE). 360 × 780, axe on every step, no sideways scroll.
 */

async function checkPage(page: Page) {
  await expectNoHorizontalScroll(page);
  await expectAxeClean(page);
}

/** The payment provider reports a transfer the API holds as a possible duplicate (mock-only control, D-220). */
async function mockHeld(page: Page, invoiceId: string): Promise<void> {
  const origin = new URL(page.url()).origin;
  const held = await page.request.post(`/bff/v1/resident/__mock/invoices/${invoiceId}/pay`, {
    headers: { "x-getproperty-csrf": "1", origin },
    data: { held: true },
  });
  expect(held.status()).toBe(200);
}

async function openInvoiceId(page: Page): Promise<string> {
  const id = await page.getByTestId("home-invoice").getAttribute("data-invoice");
  expect(id).toBeTruthy();
  return id!;
}

test.describe("home and invoices (L2 2.1)", () => {
  test("home: the unit's open invoice as the hero, tiles, notifications; two taps to the QR", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("bills"));
    await page.goto("/");
    const hero = page.getByTestId("home-invoice");
    await expect(hero).toContainText("฿5,856.00");
    await expect(hero.getByTestId("invoice-due")).toHaveAttribute("data-due", "later");
    await expect(hero.getByTestId("invoice-due")).toContainText("ครบกำหนดในอีก 5 วัน");
    await expect(page.getByTestId("unit-card")).toContainText("สัญญาเช่า");
    await expect(page.getByRole("link", { name: "ใบเสร็จ" }).first()).toBeVisible();
    await expect(page.getByTestId("home-notifications")).toContainText("บิลค่าเช่าและค่าน้ำไฟพร้อมแล้ว");
    await checkPage(page);

    // Tap 1: "scan to pay" opens the sheet right here; tap 2 is the banking app.
    await page.getByTestId("home-pay").click();
    await expect(page).toHaveURL(/\/$/);
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("pay-qr")).toBeVisible();
    await expect(sheet.getByTestId("pay-qr")).toHaveAttribute("data-payload", /^000201010212/);
    await expect(sheet).toContainText("฿5,856.00");
    await expect(sheet.getByTestId("pay-reference")).toHaveText(/^INV\d{9}$/);
    await expect(sheet.getByTestId("pay-validity")).toContainText("QR ใช้ได้อีก");
    await checkPage(page);
  });

  test("overdue is amber with words, never red (D-100); due soon is amber too", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("overdue"));
    await page.goto("/");
    const due = page.getByTestId("home-invoice").getByTestId("invoice-due");
    await expect(due).toHaveAttribute("data-due", "overdue");
    await expect(due).toContainText("เลยกำหนด 3 วัน");
    await expect(due.locator('[data-tone="danger"], .text-danger, .bg-danger')).toHaveCount(0);
    await checkPage(page);
    await page.goto("/invoices");
    await expect(page.getByTestId("open-invoice").first().getByTestId("invoice-due")).toHaveAttribute(
      "data-due",
      "overdue",
    );
    await expect(page.getByTestId("open-invoice").first()).toContainText("เกินกำหนด");
  });

  test("list: open first, then the history by billing period; receipts one tap away; /bills redirects", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("list", "multi"));
    await page.goto("/bills");
    await expect(page).toHaveURL(/\/invoices$/);
    const open = page.getByTestId("open-invoice");
    await expect(open).toHaveCount(2);
    // The one due soonest first; with two units each names its unit.
    await expect(open.first()).toContainText("ห้อง A-201");
    await expect(open.nth(1)).toContainText("ห้อง B-105");
    const periods = page.getByTestId("history-period");
    await expect(periods).toHaveCount(2);
    await expect(page.getByTestId("history-invoice")).toHaveCount(2);
    await expect(page.getByTestId("history-invoice").first()).toContainText("ชำระแล้ว");
    await checkPage(page);
    await page.getByTestId("to-receipts").click();
    await expect(page.getByTestId("receipt-item")).toHaveCount(2);
    await checkPage(page);
  });

  test("detail: lines by source, readings with source badges, units × price per unit, photo viewer, explained", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("detail"));
    await page.goto("/");
    const id = await openInvoiceId(page);
    await page.goto(`/invoices/${id}`);
    const detail = page.getByTestId("invoice-detail");
    await expect(detail.getByRole("heading", { level: 1 })).toHaveText(/^บิลเดือน /);
    const groups = page.getByTestId("invoice-lines").locator("section");
    await expect(groups).toHaveCount(3);
    await expect(groups.nth(0)).toHaveAttribute("data-group", "rent");
    await expect(groups.nth(1)).toHaveAttribute("data-group", "meter");
    await expect(groups.nth(2)).toHaveAttribute("data-group", "service");

    const electricity = page.locator('[data-testid="invoice-line"][data-kind="electricity"]');
    await expect(electricity).toContainText("มิเตอร์อัตโนมัติ");
    await expect(electricity.getByTestId("meter-readings")).toContainText("1,114.5");
    await expect(electricity.getByTestId("meter-readings")).toContainText("1,234.5");
    await expect(electricity.getByTestId("units-times-price")).toHaveText("120 kWh × 7.00 บาท = ฿840.00");
    const water = page.locator('[data-testid="invoice-line"][data-kind="water"]');
    await expect(water).toContainText("อ่านจากรูป");
    await expect(water.getByTestId("units-times-price")).toHaveText("12 m³ × 18.00 บาท = ฿216.00");
    await expect(page.getByTestId("invoice-totals")).toContainText("฿5,856.00");

    const explained = page.getByTestId("invoice-explained");
    await expect(explained).toContainText("ข้อ 5 (6)");
    await checkPage(page);

    // The meter photo: a real button, keyboard to open, Escape to close, focus comes back.
    const thumb = water.getByTestId("meter-photo");
    await thumb.focus();
    await page.keyboard.press("Enter");
    const viewer = page.getByRole("dialog");
    await expect(viewer.getByTestId("meter-photo-full")).toBeVisible();
    await expect(viewer.getByRole("heading")).toHaveText("ค่าน้ำประปา");
    await checkPage(page);
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
    await expect(thumb).toBeFocused();

    // The PDF is opened the LIFF way (system viewer), never window.open.
    await page.getByTestId("invoice-pdf").click();
    await expect
      .poll(async () => (await fakeLiffRecord(page)).opened.at(-1)?.url)
      .toMatch(/\/documents\/invoices\/.+\.pdf$/);
  });

  test("an estimated reading is flagged and explained (D-031)", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("estimate"));
    await page.goto("/");
    await page.goto(`/invoices/${await openInvoiceId(page)}`);
    await expect(page.getByTestId("line-estimated")).toContainText("ประมาณการ");
    await expect(page.getByTestId("invoice-explained")).toContainText("ประมาณการ");
    await expect(page.locator('[data-kind="water"]').getByTestId("meter-photo")).toHaveCount(0);
    await checkPage(page);
    // A link that asks for the sheet (`?pay=1`) opens it on arrival.
    await page.goto(`${page.url()}?pay=1`);
    await expect(page.getByRole("dialog").getByTestId("pay-qr")).toBeVisible();
  });
});

test.describe("pay, slips, receipts (L2 2.2)", () => {
  test("QR → the provider confirms → paid in place (SSE) → receipt: PDF and share to LINE", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("pay"));
    await page.goto("/");
    const id = await openInvoiceId(page);
    await page.getByTestId("home-pay").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("pay-waiting")).toBeVisible();

    // Helpers: banking apps open through liff.openWindow (external).
    await sheet.getByTestId("pay-open-bank").click();
    await expect(sheet.getByTestId("pay-banks").getByRole("button")).toHaveCount(7);
    await checkPage(page);
    await sheet.getByTestId("pay-banks").getByRole("button").first().click();
    await expect
      .poll(async () => (await fakeLiffRecord(page)).opened.at(-1))
      .toEqual({ url: "kplus://", external: true });

    // The provider's callback: the stream says so well before the 10-second poll would.
    await mockProviderPays(page, id);
    await expect(sheet.getByTestId("pay-paid")).toBeVisible({ timeout: 5_000 });
    await expect(sheet.getByRole("heading", { name: "ได้รับเงินแล้ว" })).toBeFocused();
    await expect(sheet).toContainText("฿5,856.00");
    await checkPage(page);

    await sheet.getByTestId("pay-receipt").click();
    await expect(page).toHaveURL(/\/receipts\/[0-9a-f-]+$/);
    const receipt = page.getByTestId("receipt-detail");
    await expect(receipt).toContainText("฿5,856.00");
    await expect(receipt).toContainText("บิลที่ชำระ");
    await checkPage(page);
    await page.getByTestId("receipt-pdf").click();
    await expect
      .poll(async () => (await fakeLiffRecord(page)).opened.at(-1)?.url)
      .toMatch(/\/documents\/receipts\/.+\.pdf$/);
    await page.getByTestId("receipt-share").click();
    await expect(page.getByTestId("receipt-share-outcome")).toHaveText("ส่งแล้ว");
    const shared = (await fakeLiffRecord(page)).shared.at(-1)!;
    expect(shared[0]!.type).toBe("text");
    expect(shared[0]!.text).toMatch(
      /^ใบเสร็จ RCP-\d{4}-\d{5} — ชำระ ฿5,856\.00 ให้ หอพักตัวอย่าง .*\/liff\?liff\.state=%2Freceipts%2F[0-9a-f-]+$/,
    );

    // Home: nothing to pay any more.
    await page.goto("/");
    await expect(page.getByTestId("home-no-invoice")).toContainText("ไม่มีบิลค้างจ่าย");
  });

  test("the pay sheet is loaded on demand by the tap: ≤ 50 KB of JS (D-179)", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("weight"));
    await page.goto("/", { waitUntil: "networkidle" });
    // Every script fetched from here on, gzipped as the server sends it (Lighthouse counts transferred bytes).
    const sizes: Promise<number>[] = [];
    const onResponse = (response: Response) => {
      if (response.request().resourceType() === "script")
        sizes.push(response.body().then((body) => gzipSync(body).length));
    };
    page.on("response", onResponse);
    await page.getByTestId("home-pay").click();
    await expect(page.getByRole("dialog").getByTestId("pay-qr")).toBeVisible();
    await page.waitForLoadState("networkidle");
    page.off("response", onResponse);
    const bytes = (await Promise.all(sizes)).reduce((sum, size) => sum + size, 0);
    test.info().annotations.push({ type: "pay sheet on demand", description: `${(bytes / 1024).toFixed(1)} KB` });
    expect(bytes).toBeGreaterThan(0);
    expect(bytes).toBeLessThanOrEqual(50 * 1024);
  });

  test("the QR's validity counts down and an expired QR is renewed", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("expiring"));
    await page.goto("/");
    await page.getByTestId("home-pay").click();
    const sheet = page.getByRole("dialog");
    const bar = sheet.getByRole("progressbar", { name: "เวลาที่ QR ยังใช้ได้" });
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("aria-valuetext", /QR ใช้ได้อีก 00:0\d/);
    await expect(sheet.getByText("QR นี้หมดอายุแล้ว")).toBeVisible({ timeout: 12_000 });
    await expect(sheet.getByTestId("pay-save-qr")).toHaveCount(0);
    await checkPage(page);
    await sheet.getByTestId("pay-qr-renew").click();
    await expect(sheet.getByText("QR นี้หมดอายุแล้ว")).toBeHidden();
    await expect(sheet.getByRole("progressbar")).toBeVisible();
  });

  test("slip: chosen from photos, checked, sent; verified automatically → paid", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("slip"));
    await page.goto("/");
    await page.getByTestId("home-pay").click();
    const sheet = page.getByRole("dialog");
    await sheet.getByTestId("pay-slip").click();
    await expect(sheet.getByTestId("stepper-progress")).toContainText("ขั้นที่ 1 จาก 3");
    // The full account number while something is due (D-209), with a copy button.
    await expect(sheet.getByTestId("slip-account")).toContainText("1234561234");
    await expect(sheet.getByTestId("pay-copy-account")).toBeVisible();
    await checkPage(page);
    await sheet.getByTestId("slip-file").setInputFiles({
      name: "slip.png",
      mimeType: "image/png",
      buffer: slipImage({ transRef: `T-${Date.now()}`, amount: "5856.00" }),
    });
    await expect(sheet.getByTestId("slip-preview")).toBeVisible();
    await expect(sheet.getByTestId("stepper-progress")).toContainText("ขั้นที่ 2 จาก 3");
    await checkPage(page);
    await sheet.getByTestId("slip-send").click();
    await expect(sheet.getByTestId("slip-status")).toHaveAttribute("data-status", "pending_verification");
    await expect(sheet.getByTestId("pay-paid")).toBeVisible({ timeout: 10_000 });
    await checkPage(page);
  });

  test("slip: an amount that does not match waits for the office; the same slip again is a duplicate", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("slipcheck"));
    await page.goto("/");
    await page.getByTestId("home-pay").click();
    const sheet = page.getByRole("dialog");
    await sheet.getByTestId("pay-slip").click();
    const slip = slipImage({ transRef: `T-${Date.now()}`, amount: "5000.00" });
    await sheet.getByTestId("slip-file").setInputFiles({ name: "slip.png", mimeType: "image/png", buffer: slip });
    await sheet.getByTestId("slip-send").click();
    await expect(sheet.getByTestId("slip-status")).toHaveAttribute("data-status", "pending_review", {
      timeout: 10_000,
    });
    await expect(sheet.getByTestId("slip-reasons")).toContainText("ยอดในสลิปน้อยกว่ายอดที่ต้องจ่าย");
    await checkPage(page);

    // The office has not decided yet: the same transfer sent again is a duplicate (one transfer pays once).
    await page.reload();
    await page.getByTestId("home-pay").click();
    await sheet.getByTestId("pay-slip").click();
    await sheet.getByTestId("slip-file").setInputFiles({ name: "slip-again.png", mimeType: "image/png", buffer: slip });
    await sheet.getByTestId("slip-send").click();
    await expect(sheet.getByTestId("slip-status")).toHaveAttribute("data-status", "duplicate", { timeout: 10_000 });
    await expect(sheet.getByTestId("slip-outcome")).toContainText("การโอนหนึ่งครั้งใช้จ่ายได้ครั้งเดียว");
    await checkPage(page);
  });

  test("a QR transfer held by the API as a possible duplicate never shows as paid; the sheet says the office is checking it (D-220, D-228)", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("heldqr"));
    await page.goto("/");
    const id = await openInvoiceId(page);
    await page.getByTestId("home-pay").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("pay-waiting")).toBeVisible();
    await expect(sheet.getByTestId("pay-checking")).toHaveCount(0);
    // The provider reports a transfer the API holds for the Owner (pending, nothing booked): `payment.held` reaches
    // the resident, the sheet refetches its payment details and says the office is checking — no amount, no reason.
    await mockHeld(page, id);
    const checking = sheet.getByTestId("pay-checking");
    await expect(checking).toContainText("ผู้ดูแลอาคารกำลังตรวจสอบการโอนของคุณ", { timeout: 5000 });
    await expect(checking).toContainText("1 รายการ");
    await expect(checking).toHaveAttribute("data-count", "1");
    await expect(sheet.getByTestId("pay-paid")).toHaveCount(0);
    await expect(sheet.getByTestId("pay-waiting")).toBeVisible();
    await checkPage(page);
    // Past the status poll: still waiting, never "paid".
    await page.waitForTimeout(11_000);
    await expect(sheet.getByTestId("pay-paid")).toHaveCount(0);
    // The office dismisses it as the same transfer (`payment.dismissed`): the hint goes, the bill is as it was.
    await mockOwnerDecidesHeld(page, id, "dismiss");
    await expect(checking).toHaveCount(0, { timeout: 5000 });
    await expect(sheet.getByTestId("pay-waiting")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.getByTestId("home-invoice")).toBeVisible();
  });

  test("a held transfer the office books as a second payment turns the sheet paid (English, D-228)", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: "gp_locale", value: "en", url: baseURL! }]);
    await seedSession(context, baseURL!, subject("heldbook"));
    await page.goto("/");
    const id = await openInvoiceId(page);
    // Held before the sheet is opened: it says so straight away.
    await mockHeld(page, id);
    await page.getByTestId("home-pay").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("pay-checking")).toContainText("The office is checking your transfer");
    await expect(sheet.getByTestId("pay-checking")).toContainText("Please wait before paying again");
    await checkPage(page);
    await mockOwnerDecidesHeld(page, id, "confirm");
    await expect(sheet.getByTestId("pay-paid")).toBeVisible({ timeout: 5000 });
  });

  test("a slip of the same amount as a QR payment already booked waits for the office (possible_qr_duplicate)", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("qrdup"));
    await page.goto("/");
    const id = await openInvoiceId(page);
    const origin = new URL(page.url()).origin;
    // A QR part payment of ฿1,000 is booked first (the bill is partly paid)…
    const part = await page.request.post(`/bff/v1/resident/__mock/invoices/${id}/pay`, {
      headers: { "x-getproperty-csrf": "1", origin },
      data: { amount: "1000.00" },
    });
    expect(part.status()).toBe(200);
    await page.reload();
    // …then a slip of the same ฿1,000 arrives: maybe the same transfer, so the office checks it (D-220).
    await page.getByTestId("home-pay").click();
    const sheet = page.getByRole("dialog");
    await sheet.getByTestId("pay-slip").click();
    await sheet.getByTestId("slip-file").setInputFiles({
      name: "slip.png",
      mimeType: "image/png",
      buffer: slipImage({ transRef: `T-${Date.now()}`, amount: "1000.00" }),
    });
    await sheet.getByTestId("slip-send").click();
    await expect(sheet.getByTestId("slip-status")).toHaveAttribute("data-status", "pending_review", {
      timeout: 10_000,
    });
    await expect(sheet.getByTestId("slip-reasons")).toContainText(
      "มีการชำระด้วย QR ยอดเดียวกันสำหรับบิลนี้แล้ว ผู้ดูแลอาคารจะตรวจสอบว่าไม่ใช่การโอนครั้งเดียวกัน",
    );
    await checkPage(page);
  });

  test("no QR from the landlord: the transfer account, then the slip", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("noqr"));
    await page.goto("/");
    await page.getByTestId("home-pay").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("pay-account")).toContainText("ธนาคารตัวอย่าง");
    await expect(sheet.getByTestId("pay-qr")).toHaveCount(0);
    await checkPage(page);
    await sheet.getByTestId("pay-slip").click();
    await expect(sheet.getByTestId("slip-panel")).toBeVisible();
  });

  test("slips not accepted by the landlord: no slip button", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("noslip"));
    await page.goto("/");
    await page.getByTestId("home-pay").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("pay-qr")).toBeVisible();
    await expect(sheet.getByTestId("pay-slip")).toHaveCount(0);
  });

  test("outside LINE the receipt is shared with the system share sheet or copied; deep links to deposits redirect", async ({
    page,
    context,
    baseURL,
  }) => {
    const sub = subject("sharing");
    await fakeLiff(context, baseURL!, { sub, inClient: false });
    await seedSession(context, baseURL!, sub);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/receipts");
    await page.getByTestId("receipt-item").first().click();
    await page.evaluate(() => {
      // No Web Share in this browser: the text is copied.
      Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    });
    await page.getByTestId("receipt-share").click();
    await expect(page.getByTestId("receipt-share-outcome")).toHaveText("คัดลอกข้อความแล้ว วางในแชตได้เลย");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/^ใบเสร็จ RCP-/);
    expect((await fakeLiffRecord(page)).shared).toHaveLength(0);

    await page.goto("/deposits/00000000-0000-4000-8000-000000000000");
    await expect(page).toHaveURL(/\/deposit\/00000000-0000-4000-8000-000000000000$/);
  });
});
