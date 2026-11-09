import { expect, test, type Page } from "@playwright/test";

import {
  expectAxeClean,
  expectNoHorizontalScroll,
  fakeLiffRecord,
  mockProviderPays,
  seedSession,
  subject,
} from "./support";

/**
 * JL1 — my common fees (J1.1–J1.2, D-304 … D-308, D-325, D-326): `/fees` as paper per period across units, the pay
 * actions, the budget card and the documents; statements with their PDF; a payment plan requested, read and withdrawn;
 * a debt-clearance certificate refused while something is due, then issued after paying; auto-pay where the channel is
 * off. Mock scenario words (`mocks/state.ts`, `mocks/billing.ts`, `mocks/juristic.ts`): `coowner`, `twounits`,
 * `annual`, `duesoon`, `overdue`, `village`, `planactive`, `recurringoff`, `autopay`.
 * Written for the deferred e2e run (founder 2026-10-28) — not run in this step.
 */
async function checkPage(page: Page) {
  await expectNoHorizontalScroll(page);
  await expectAxeClean(page);
}

const C1203 = "c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("my common fees", () => {
  test("two units on one paper for the year, the one filled action, slip and auto-pay, budget and documents", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("coowner", "twounits", "annual"));
    await page.goto("/");
    // The bills tab of a co-owner opens the common fees.
    await page.getByRole("navigation", { name: "เมนูด่วน" }).getByRole("link", { name: "บิล" }).click();
    await expect(page).toHaveURL(/\/fees$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ค่าส่วนกลางของฉัน");

    const paper = page.getByTestId("fee-paper");
    await expect(paper).toHaveAttribute("data-open", "true");
    await expect(paper.getByRole("heading", { level: 2 })).toHaveText(/^ค่าส่วนกลาง ปี 25\d\d$/);
    await expect(paper.getByTestId("fee-unit")).toHaveCount(2);
    await expect(paper.getByTestId("fee-unit").first()).toContainText("C-1203");
    await expect(paper.getByTestId("fee-unit").first()).toContainText("42.50 ตร.ม.");
    await expect(paper.getByTestId("fee-unit").first()).toContainText("อัตราส่วนกรรมสิทธิ์ 0.003412");
    await expect(paper.getByTestId("fee-unit").first()).toContainText("฿25,500.00");
    // Two invoices: no total is computed in the browser (contract request #43); each unit is paid on its own.
    await expect(page.getByTestId("fees-pay-first")).toContainText("C-1203");
    // Due in 12 days: muted, no colour.
    await expect(paper.getByTestId("fee-due")).toHaveAttribute("data-tone", "muted");
    // No eyebrow, no legal footer (J-DESIGN §3), never ลูกหนี้ (§1.2).
    await expect(page.getByText("ใบแจ้งหนี้อย่างเป็นทางการ")).toHaveCount(0);
    await expect(page.getByText(/พ\.ร\.บ\./)).toHaveCount(0);
    await expect(page.getByText(/ลูกหนี้/)).toHaveCount(0);

    // One filled action: the PromptPay QR of the soonest-due invoice; the slip is outlined and opens the slip step.
    const actions = page.getByTestId("fees-actions");
    await expect(actions.getByTestId("fees-pay")).toHaveText("ชำระด้วย QR พร้อมเพย์");
    await actions.getByTestId("fees-slip").click();
    await expect(page.getByTestId("pay-sheet")).toBeVisible();
    await expect(page.getByTestId("slip-panel")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(actions.getByTestId("fees-autopay")).toBeVisible();

    await expect(page.getByTestId("fees-budget")).toContainText("งบประมาณปีนี้");
    await expect(page.getByTestId("fees-budget").getByRole("progressbar")).toHaveAttribute("aria-valuenow", "77");
    const documents = page.getByTestId("fees-documents");
    await expect(documents).toContainText("หนังสือรับรองการปลอดหนี้");
    await expect(documents).toContainText("ใบแจ้งยอดรายเดือน");
    await checkPage(page);

    // Paying the soonest invoice leaves the other unit on the paper.
    await actions.getByTestId("fees-pay").click();
    await expect(page.getByTestId("pay-sheet")).toBeVisible();
  });

  test("due within 7 days is amber, past due is red — in words", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("coowner", "duesoon"));
    await page.goto("/fees");
    await expect(page.getByTestId("fee-due")).toHaveAttribute("data-tone", "amber");
    await expect(page.getByTestId("fee-due")).toContainText("อีก 5 วัน");

    await context.clearCookies();
    await seedSession(context, baseURL!, subject("coowner", "overdue"));
    await page.goto("/fees");
    await expect(page.getByTestId("fee-due")).toHaveAttribute("data-tone", "red");
    await expect(page.getByTestId("fee-due")).toContainText("เลยกำหนดมา 12 วัน");
    await checkPage(page);
  });

  test("a house in a housing estate speaks of บ้าน and ตร.วา", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("village", "annual"));
    await page.goto("/fees");
    const unit = page.getByTestId("fee-unit").first();
    await expect(unit).toContainText("88/12");
    await expect(unit.getByTestId("fee-unit-size")).toHaveText("62.50 ตร.วา");
    await expect(unit.getByTestId("fee-unit-share")).toHaveText("แปลง B-14");
    await expect(page.getByTestId("fees-documents")).toContainText("บ้าน 88/12");
    await checkPage(page);
  });

  test("statements: list, paper and the PDF", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("coowner"));
    await page.goto("/fees");
    await page.getByTestId("fees-statements").click();
    await expect(page.getByTestId("statement-list")).toBeVisible();
    await expect(page.getByTestId("statement-row")).toHaveCount(2);
    await page.getByTestId("statement-row").first().click();
    await expect(page.getByTestId("statement-paper")).toContainText("ยอดยกมา");
    await expect(page.getByTestId("statement-amount-due")).toContainText("฿2,125.00");
    await expect(page.getByTestId("statement-open")).toContainText("C-1203");
    await checkPage(page);
    await page.getByTestId("statement-pdf").click();
    await expect
      .poll(async () => (await fakeLiffRecord(page)).opened.map((o) => o.url).join(" "))
      .toMatch(/__mock\/documents\/statements\/.+\.pdf/);
  });

  test("a statement whose PDF is still being made says so", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("coowner", "stmpending"));
    await page.goto("/statements");
    await page.getByTestId("statement-row").first().click();
    await page.getByTestId("statement-pdf").click();
    await expect(page.getByRole("alert")).toBeVisible();
  });

  test("payment plan: refused below the minimum, requested, read with instalments, withdrawn", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("coowner", "annual"));
    await page.goto("/fees");
    await page.getByTestId("fees-plan").click();
    await expect(page).toHaveURL(new RegExp(`/units/${C1203}/payment-plans$`));
    await page.getByTestId("plan-request").click();
    await page.getByTestId("plan-instalments").fill("1");
    await page.getByTestId("plan-submit").click();
    await expect(page.getByTestId("plan-form-summary")).toContainText("อย่างน้อย 2 งวด");
    await checkPage(page);

    // Above the office's limit from the request options (CR #45): checked on the phone, named in the hint.
    await expect(page.getByTestId("plan-principal")).toBeVisible();
    await expect(page.getByText("ผ่อนรายเดือน 2–12 งวด ตามที่สำนักงานกำหนด")).toBeVisible();
    await page.getByTestId("plan-instalments").fill("24");
    await page.getByTestId("plan-submit").click();
    await expect(page.getByTestId("plan-form-summary")).toContainText("ไม่เกิน 12 งวด");

    await page.getByTestId("plan-instalments").fill("6");
    await page.getByTestId("plan-note").fill("ขอแบ่งจ่ายรายเดือน");
    await page.getByTestId("plan-submit").click();
    await expect(page).toHaveURL(/\/payment-plans\/[0-9a-f-]+\?sent=1$/);
    await expect(page.getByTestId("plan-state")).toHaveAttribute("data-state", "proposed");
    await expect(page.getByTestId("plan-instalment")).toHaveCount(6);
    await checkPage(page);

    // A second request while one is open points to it.
    await page.goto(`/units/${C1203}/payment-plans/new`);
    await page.getByTestId("plan-submit").click();
    await expect(page.getByText("ห้องนี้มีแผนผ่อนอยู่แล้ว")).toBeVisible();

    await page.goto(`/units/${C1203}/payment-plans`);
    await page.getByTestId("plan-open").click();
    await page.getByTestId("plan-withdraw").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ถอนคำขอ" }).click();
    await expect(page.getByTestId("plan-state")).toHaveAttribute("data-state", "cancelled");
    await expect(page.getByTestId("plan-withdraw")).toHaveCount(0);
  });

  test("an approved plan shows the next instalment", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("coowner", "planactive"));
    await page.goto(`/units/${C1203}/payment-plans`);
    await expect(page.getByTestId("plan-current")).toContainText("กำลังผ่อน");
    await expect(page.getByTestId("plan-next")).toContainText("งวดที่ 2");
    await page.getByTestId("plan-open").click();
    await expect(page.getByTestId("plan-instalment").first()).toHaveAttribute("data-state", "paid");
    await checkPage(page);
  });

  test("debt clearance: refused while something is due, issued after paying, downloaded and shared", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("coowner"));
    await page.goto("/fees");
    await page.getByTestId("fees-clearance").click();
    await page.getByTestId("clearance-request").click();
    await page.getByTestId("clearance-submit").click();
    const refused = page.getByTestId("clearance-outstanding");
    await expect(refused).toContainText("ยังออกหนังสือรับรองไม่ได้");
    await expect(page.getByTestId("clearance-outstanding-amount")).toHaveText("฿2,125.00");
    await expect(page.getByText(/ลูกหนี้/)).toHaveCount(0);
    await checkPage(page);
    await expect(page.getByTestId("clearance-pay-first")).toHaveAttribute("href", "/fees");

    // Pay (the mock provider), then ask again: issued at once.
    await page.goto("/fees");
    const href = await page.getByTestId("fee-unit").first().locator("a[href^='/invoices/']").getAttribute("href");
    const open = href!.split("/").pop()!;
    await mockProviderPays(page, open);
    await page.goto(`/units/${C1203}/debt-clearances/new`);
    await page.getByTestId("clearance-submit").click();
    const certificate = page.getByTestId("clearance-certificate");
    await expect(certificate).toHaveAttribute("data-state", "issued");
    await expect(certificate).toContainText("DCL-");
    await expect(page.getByTestId("clearance-code")).toBeVisible();
    await checkPage(page);
    await page.getByTestId("clearance-download").click();
    await expect
      .poll(async () => (await fakeLiffRecord(page)).opened.map((o) => o.url).join(" "))
      .toMatch(/debt-clearances/);
    await page.getByTestId("clearance-share").click();
    await expect(page.getByTestId("clearance-share-outcome")).not.toBeEmpty();

    await page.goto(`/units/${C1203}/debt-clearances`);
    await expect(page.getByTestId("clearance-row")).toHaveCount(1);
  });

  test("auto-pay not offered in this building: no link (recurringAvailable false), the page explains", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("coowner", "recurringoff"));
    await page.goto("/fees");
    await expect(page.getByTestId("fees-pay")).toBeVisible();
    await expect(page.getByTestId("fees-autopay")).toHaveCount(0);
    await page.goto(`/units/${C1203}/auto-pay`);
    await expect(page.getByTestId("autopay-unavailable")).toContainText("ยังไม่เปิดให้บริการในอาคารนี้");
  });

  test("auto-pay: set up at the provider, then cancelled", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("coowner"));
    await page.goto(`/units/${C1203}/auto-pay`);
    await page.getByTestId("autopay-start").click();
    await expect
      .poll(async () => (await fakeLiffRecord(page)).opened.map((o) => o.url).join(" "))
      .toMatch(/recurring\/setup/);
    await expect(page.getByTestId("autopay-live")).toBeVisible();
    await page.getByTestId("autopay-cancel").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ยกเลิกการหัก" }).click();
    await expect(page.getByTestId("autopay-form")).toBeVisible();
  });

  test("deep links from LINE land on the screens", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("coowner"));
    for (const path of [`/units/${C1203}/payment-plans`, `/units/${C1203}/debt-clearances`, "/statements"]) {
      await page.goto(`/liff?liff.state=${encodeURIComponent(path)}`);
      await expect(page).toHaveURL(new RegExp(`${path.replace(/[/]/g, "\\/")}$`));
    }
    await page.goto(`/invoices?unitId=${C1203}`);
    await expect(page.getByTestId("invoice-list")).toBeVisible();
  });

  for (const locale of ["en", "my", "km", "lo", "zh"] as const) {
    test(`/fees in ${locale} at 360 px: no sideways scroll, axe clean`, async ({ page, context, baseURL }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await context.addCookies([{ name: "gp_locale", value: locale, url: baseURL! }]);
      await seedSession(context, baseURL!, subject("coowner", "twounits", "annual"));
      await page.goto("/fees");
      await expect(page.getByTestId("fee-paper")).toBeVisible();
      await checkPage(page);
    });
  }
});
