import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, forceProblems, seedSession, subject } from "./support";

/**
 * GL3 (api G3, D-294) — contracts and renewals for residents: a document of the contract library read and e-signed
 * (OTP + PDF hash, D-062) with its legal-review state and disclaimer as the API returns them; an offer to renew
 * accepted (→ the renewal lease to sign) or declined (→ the move-out notice the API records, D-219); every new screen
 * in the six resident languages at 360 × 780.
 */
const LOCALES = ["th", "en", "my", "km", "lo", "zh"] as const;
type Locale = (typeof LOCALES)[number];

const FAMILY: Partial<Record<Locale, string>> = {
  my: "GP Noto Sans Myanmar",
  km: "GP Noto Sans Khmer",
  lo: "GP Noto Sans Lao",
  zh: "GP Noto Sans SC",
};

const copy = (locale: Locale, file: string) =>
  JSON.parse(readFileSync(join(__dirname, "../src/i18n/messages", locale, `${file}.json`), "utf8")) as Record<
    string,
    unknown
  >;
const text = (locale: Locale, file: string, path: string) =>
  path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], copy(locale, file)) as string;

async function useLocale(context: BrowserContext, baseURL: string, locale: Locale) {
  await context.addCookies([{ name: "gp_locale", value: locale, url: baseURL }]);
}

async function expectScriptFont(page: Page, locale: Locale) {
  const family = FAMILY[locale];
  if (!family) return;
  const loaded = await page.evaluate(async (name) => {
    await document.fonts.ready;
    return [...document.fonts].filter((face) => face.family.replace(/"/g, "") === name && face.status === "loaded")
      .length;
  }, family);
  expect(loaded, `${family} faces loaded`).toBeGreaterThan(0);
}

async function drawSignature(page: Page) {
  const pad = page.getByTestId("signature-pad");
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 100, { steps: 5 });
  await page.mouse.move(box.x + 160, box.y + 50, { steps: 5 });
  await page.mouse.up();
  await expect(pad).toHaveAttribute("data-empty", "false");
}

const DISCLAIMER_TH = "ตัวอย่างสัญญาเพื่ออำนวยความสะดวก ไม่ใช่คำแนะนำทางกฎหมาย";
const DISCLAIMER_EN = "A sample contract provided for convenience; not legal advice.";

test.describe("contracts and renewals (GL3, D-294)", () => {
  test("an addendum from home: legal review and disclaimer as returned, read, draw, SMS code, signed by everyone", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("contracts"));
    await page.goto("/");
    const card = page.getByTestId("home-contracts-to-sign");
    await expect(card).toContainText("เอกสาร 1 ฉบับรอให้อ่านและลงนาม");
    await card.getByRole("link").click();

    const detail = page.getByTestId("contract-detail");
    await expect(detail).toHaveAttribute("data-kind", "addendum");
    await expect(detail.getByRole("heading", { level: 1 })).toHaveText("บันทึกต่อท้ายสัญญาเช่า");
    await expect(page.getByTestId("contract-legal")).toHaveAttribute("data-state", "pending_legal_verification");
    await expect(page.getByTestId("contract-legal")).toContainText("ยังรอการตรวจทานทางกฎหมาย");
    await expect(page.getByTestId("contract-disclaimer")).toHaveText(DISCLAIMER_TH);
    await expect(page.getByTestId("contract-terms")).toContainText("ที่จอดรถคันที่สอง");
    await expect(page.getByTestId("contract-signers")).toContainText("ยังไม่ลงนาม");
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await page.getByTestId("contract-sign").click();
    await expect(page.getByTestId("sign-flow")).toHaveAttribute("data-step", "read");
    await expect(page.getByTestId("sign-reader").getByTestId("contract-disclaimer")).toHaveText(DISCLAIMER_TH);
    await expectAxeClean(page);
    const reader = page.getByTestId("sign-reader");
    await reader.evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await page.getByRole("checkbox", { name: "ฉันอ่านเอกสารทั้งหมดแล้วและตกลงตามเอกสาร" }).click();
    await page.getByTestId("sign-read-next").click();

    await expect(page.getByTestId("sign-flow")).toHaveAttribute("data-step", "draw");
    await drawSignature(page);
    await page.getByTestId("sign-draw-next").click();
    await expect(page.getByTestId("sign-otp-lead")).toContainText("08•-•••-1234");
    await page.getByRole("textbox", { name: "หลักที่ 1" }).fill("123456");

    const done = page.getByTestId("sign-done");
    await expect(done).toContainText("ลงนามครบทุกคนแล้ว");
    await expect(page.getByTestId("sign-hash")).toHaveText(/^[0-9a-f]{64}$/);
    await expectAxeClean(page);
    await page.getByTestId("contract-sign-back").click();
    await expect(page.getByTestId("contract-detail")).toHaveAttribute("data-state", "signed");
    await expect(page.getByTestId("contract-sign")).toHaveCount(0);

    await page.goto("/contracts");
    await expect(page.getByTestId("contracts-to-sign")).toHaveCount(0);
    await expect(page.getByTestId("contracts-others").getByTestId("contract-card")).toHaveCount(2);
    await expectAxeClean(page);
  });

  test("accepting an offer to renew leads to the renewal lease to sign", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("renewal", "accept"));
    await page.goto("/");
    await page.getByTestId("home-renewal-offer").getByRole("link").click();

    const offer = page.getByTestId("renewal-offer");
    await expect(offer).toHaveAttribute("data-state", "offered");
    await expect(page.getByTestId("renewal-offered-rent")).toContainText("15,500");
    await expect(page.getByTestId("renewal-message")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await page.getByTestId("renewal-accept").click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("สัญญาใหม่จะส่งให้คุณอ่านและลงนามทันที");
    await dialog.getByRole("button", { name: "ตอบรับ", exact: true }).click();

    await expect(page.getByTestId("renewal-offer")).toHaveAttribute("data-state", "accepted");
    await expectAxeClean(page);
    await page.getByTestId("renewal-sign").click();
    await expect(page).toHaveURL(/\/lease\/[0-9a-f-]{36}\/sign$/);
    await expect(page.getByTestId("sign-flow")).toHaveAttribute("data-step", "read");
  });

  test("declining from the lease page records the move-out notice to the end date", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("renewal", "decline"));
    await page.goto("/lease");
    await page.getByTestId("lease-renewal-open").click();

    // The landlord's B7.5 letter and the offer lead to each other.
    await page.getByTestId("renewal-letter").click();
    await expect(page.getByTestId("letter-view")).toHaveAttribute("data-kind", "renewal_offer");
    await page.getByTestId("letter-renewal-offer").click();

    await page.getByTestId("renewal-decline").click();
    await expect(page.getByTestId("renewal-decline-consequence")).toContainText("แจ้งย้ายออก");
    await page.getByTestId("renewal-decline-reason").fill("ย้ายไปทำงานต่างจังหวัด");
    await expectAxeClean(page);
    await page.getByTestId("renewal-decline-confirm").click();

    await expect(page.getByTestId("renewal-offer")).toHaveAttribute("data-state", "declined");
    await expect(page.getByTestId("renewal-declined-notice")).toContainText("บันทึกการแจ้งย้ายออกแล้ว");
    await expectAxeClean(page);
    await page.getByTestId("renewal-to-lease").click();
    await expect(page.getByTestId("lease-view")).toContainText("แจ้งย้ายออกแล้ว");
    await expect(page.getByTestId("lease-renewal-offer")).toHaveCount(0);
  });

  test("an owner acknowledgement still needed is shown with its legal reference; the offer stays open", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("renewal", "compliance"));
    await forceProblems(context, baseURL!, { "resident.renewals.accept": "compliance.acknowledgement_required" });
    await page.goto("/contracts");
    await page.getByTestId("contracts-open-offers").getByTestId("renewal-card").click();
    await page.getByTestId("renewal-accept").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ตอบรับ", exact: true }).click();
    const decision = page.getByTestId("renewal-decision");
    await expect(decision.getByRole("alert")).toContainText("ประกาศคณะกรรมการว่าด้วยสัญญา");
    await expect(page.getByTestId("renewal-offer")).toHaveAttribute("data-state", "offered");
    await expect(page.getByTestId("renewal-accept")).toBeEnabled();
  });

  test("nothing yet: the list says so", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("nothing", "to", "sign"));
    await page.goto("/contracts");
    await expect(page.getByTestId("contracts-empty")).toBeVisible();
    await expectAxeClean(page);
  });
});

for (const locale of LOCALES) {
  test(`contracts, the sign step and an offer in ${locale} at 360 × 780`, async ({ page, context, baseURL }) => {
    await useLocale(context, baseURL!, locale);
    await seedSession(context, baseURL!, subject("locale", locale, "contracts", "renewal"));

    await page.goto("/contracts");
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(text(locale, "resident/contracts", "list.title"));
    await expectScriptFont(page, locale);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await page.getByTestId("contracts-to-sign").getByTestId("contract-card").click();
    await expect(page.getByTestId("contract-detail").getByRole("heading", { level: 1 })).toHaveText(
      text(locale, "resident/contracts", "kind.addendum"),
    );
    await expect(page.getByTestId("contract-legal")).toContainText(
      text(locale, "resident/contracts", "legal.pendingTitle"),
    );
    await expect(page.getByTestId("contract-disclaimer")).toHaveText(locale === "th" ? DISCLAIMER_TH : DISCLAIMER_EN);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await page.getByTestId("contract-sign").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      text(locale, "resident/contracts", "sign.read.title"),
    );
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await page.goto("/contracts");
    await page.getByTestId("contracts-open-offers").getByTestId("renewal-card").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      text(locale, "resident/contracts", "renewal.title"),
    );
    await page.getByTestId("renewal-decline").click();
    await expect(page.getByTestId("renewal-decline-form")).toBeVisible();
    await expectScriptFont(page, locale);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });
}
