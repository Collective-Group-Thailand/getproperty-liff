import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, forceProblems, seedSession, subject } from "./support";

/**
 * GL4 (api G8 + G9, D-299, D-301) — relocation and reviews for residents: after a move-out notice, relocation help
 * (Collective's own consent, never pre-ticked, stopped in one tap), the destination and budget, the listings there and
 * an enquiry that carries the rent record only when ticked; a verified review of the building (too early → the first
 * day; eligible → rating, text, the `review.publish` text with its box never pre-ticked, personal data refused) waiting
 * for moderation, then published and withdrawn; every new screen in the six resident languages at 360 × 780.
 *
 * Written for GL4; **not run** (founder change 2026-10-28 — e2e deferred).
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

async function firstLeaseId(page: Page): Promise<string> {
  const leases = await page.request.get("/bff/v1/resident/leases");
  expect(leases.status()).toBe(200);
  return ((await leases.json()) as { id: string }[])[0]!.id;
}

/** The platform moderator decides (mock-only control). */
async function moderate(page: Page, leaseId: string, body: Record<string, string>) {
  const origin = new URL(page.url()).origin;
  const res = await page.request.post(`/bff/v1/resident/__mock/reviews/${leaseId}/moderate`, {
    headers: { "x-getproperty-csrf": "1", origin },
    data: body,
  });
  expect(res.status()).toBe(200);
}

const CONSENT_TH = "ช่วยหาที่อยู่ใหม่เมื่อย้ายออก";
const CONSENT_EN = "Help finding my next home when I move out";
const REVIEW_TH = "เผยแพร่รีวิวอาคารของฉัน";
const REVIEW_EN = "Publish my building review";

test.describe("relocation help after a move-out notice (GL4, D-299)", () => {
  test("from the notice to an enquiry with the rent record; stop in one tap erases the destination", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("relocate"));
    const leaseId = await (async () => {
      await page.goto("/");
      return firstLeaseId(page);
    })();

    // The notice's done screen leads to relocation help.
    await page.goto(`/lease/${leaseId}/notice`);
    await page.getByTestId("notice-review").click();
    await page.getByTestId("notice-submit").click();
    await expect(page.getByTestId("notice-done")).toBeVisible();
    await page.getByTestId("relocation-prompt-open").click();

    // Off: the API's text and an unticked box; refused without the tick.
    await expect(page.getByTestId("relocation-page")).toHaveAttribute("data-on", "false");
    await expect(page.getByTestId("relocation-consent")).toContainText(CONSENT_TH);
    await page.getByTestId("relocation-consent-slot").scrollIntoViewIfNeeded();
    const box = page.getByTestId("relocation-consent-box");
    await expect(box).toHaveAttribute("aria-checked", "false");
    await page.getByTestId("relocation-consent-submit").click();
    await expect(page.getByTestId("relocation-consent-form").getByRole("alert")).toBeVisible();
    await expectAxeClean(page);
    await box.click();
    await page.getByTestId("relocation-consent-submit").click();

    // On: an offer for the lease under notice.
    await expect(page.getByTestId("relocation-on")).toBeVisible();
    await expect(page.getByTestId("relocation-page")).toHaveAttribute("data-on", "true");
    const link = page.getByTestId("relocation-offer-link");
    await expect(link).toHaveAttribute("data-state", "open");
    await link.click();

    // Destination: an area, then the listings there up to the budget.
    await expect(page.getByTestId("relocation-offer")).toHaveAttribute("data-state", "open");
    await expect(page.getByTestId("relocation-listings")).toHaveCount(0);
    await page.getByTestId("relocation-destination-slot").scrollIntoViewIfNeeded();
    await page.getByTestId("relocation-area-search").fill("อารี");
    await page.getByTestId("relocation-area-option").first().click();
    await expect(page.getByTestId("relocation-area-chosen")).toHaveAttribute("data-slug", "ari");
    await page.getByTestId("relocation-budget").fill("16000");
    await page.getByTestId("relocation-destination-submit").click();
    await expect(page.getByTestId("relocation-destination-current")).toContainText("อารีย์");
    const listings = page.getByTestId("relocation-listing");
    await expect(listings).toHaveCount(2);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    // Ask the owner, rent record ticked now (never by default) → it went with the enquiry.
    await listings.first().getByTestId("relocation-listing-enquire").click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByTestId("relocation-enquire-share-box")).toHaveAttribute("aria-checked", "false");
    await expect(sheet.getByTestId("relocation-enquire-consent")).toHaveAttribute("aria-checked", "false");
    await sheet.getByTestId("relocation-enquire-message").fill("สนใจห้องนี้ค่ะ ย้ายเข้าได้ต้นเดือนหน้า");
    await sheet.getByTestId("relocation-enquire-share-box").click();
    await sheet.getByTestId("relocation-enquire-submit").click();
    await expect(sheet.getByRole("alert")).toBeVisible(); // the new owner's consent is required
    await sheet.getByTestId("relocation-enquire-consent").click();
    await expectAxeClean(page);
    await sheet.getByTestId("relocation-enquire-submit").click();
    const done = sheet.getByTestId("relocation-enquire-done");
    await expect(done).toHaveAttribute("data-shared", "true");
    await expect(sheet.getByTestId("relocation-enquire-record")).toContainText("ส่งประวัติการจ่ายค่าเช่าไปด้วยแล้ว");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("relocation-enquired-count")).toBeVisible();

    // The rent record lists the share with that enquiry.
    await page.goto("/profile/rent-record");
    await expect(page.getByTestId("rent-record-page")).toContainText("คอนโด 1 ห้องนอน");

    // Stop in one tap: the offer closes and its destination is erased.
    await page.goto("/relocation");
    await page.getByTestId("relocation-stop").click();
    await expect(page.getByTestId("relocation-stopped")).toBeVisible();
    await expect(page.getByTestId("relocation-offer-link")).toHaveAttribute("data-state", "withdrawn");
    await page.getByTestId("relocation-offer-link").click();
    await expect(page.getByTestId("relocation-offer-turn-on")).toBeVisible();
    await expect(page.getByTestId("relocation-destination-current")).toHaveCount(0);
  });

  test("the lease page leads to it while the notice is on file; no rent record = nothing to tick", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("moveout", "norecord"));
    await forceProblems(context, baseURL!, { "rent_record.none": "1" });
    await page.goto("/");
    const leaseId = await firstLeaseId(page);
    await page.goto(`/lease/${leaseId}`);
    await page.getByTestId("relocation-prompt-open").click();
    await page.getByTestId("relocation-consent-slot").scrollIntoViewIfNeeded();
    await page.getByTestId("relocation-consent-box").click();
    await page.getByTestId("relocation-consent-submit").click();
    await page.getByTestId("relocation-offer-link").click();
    await page.getByTestId("relocation-destination-slot").scrollIntoViewIfNeeded();
    await page.getByRole("radio", { name: "จังหวัด" }).click();
    await page.getByTestId("relocation-province").fill("กรุงเทพมหานคร");
    await page.getByTestId("relocation-district").fill("จตุจักร");
    await page.getByTestId("relocation-destination-submit").click();
    await expect(page.getByTestId("relocation-listing")).toHaveCount(2);
    await page.getByTestId("relocation-listing").first().getByTestId("relocation-listing-enquire").click();
    await expect(page.getByRole("dialog").getByTestId("relocation-enquire-no-record")).toBeVisible();

    await page.goto("/relocation");
    await page.getByTestId("relocation-offer-link").click();
    await page.getByTestId("relocation-dismiss").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ปิดรายการ", exact: true }).click();
    await expect(page.getByTestId("relocation-offer")).toHaveAttribute("data-state", "dismissed");
  });

  test("consented without a notice: the page says when offers come", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("relocation", "plain"));
    await page.goto("/relocation");
    await page.getByTestId("relocation-consent-slot").scrollIntoViewIfNeeded();
    await page.getByTestId("relocation-consent-box").click();
    await page.getByTestId("relocation-consent-submit").click();
    await expect(page.getByTestId("relocation-offers-empty")).toContainText(
      text("th", "resident/relocation", "offers.emptyTitle"),
    );
    await expectAxeClean(page);
  });
});

test.describe("verified reviews of the building (GL4, D-301)", () => {
  test("too early: the lease page and the review page give the first day", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("review", "early"));
    await page.goto("/");
    const leaseId = await firstLeaseId(page);
    await page.goto(`/lease/${leaseId}`);
    await expect(page.getByTestId("lease-review")).toHaveAttribute("data-kind", "wait");
    await page.goto(`/lease/${leaseId}/review`);
    await expect(page.getByTestId("review-too-early")).toBeVisible();
    await expect(page.getByTestId("review-form")).toHaveCount(0);
    await expectAxeClean(page);
  });

  test("write → refused with a phone number → pending → published with the owner's reply → withdrawn", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("reviewer"));
    await page.goto("/");
    const leaseId = await firstLeaseId(page);
    await page.goto(`/lease/${leaseId}`);
    await expect(page.getByTestId("lease-review")).toHaveAttribute("data-kind", "write");
    await page.getByTestId("lease-review-open").click();

    await expect(page.getByTestId("review-page")).toHaveAttribute("data-kind", "write");
    await page.getByTestId("review-form-slot").scrollIntoViewIfNeeded();
    await page.getByTestId("review-consent-slot").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("review-consent-text")).toContainText(REVIEW_TH);
    const consent = page.getByTestId("review-consent");
    await expect(consent).toHaveAttribute("aria-checked", "false");
    await page.getByTestId("review-submit").click();
    await expect(page.getByTestId("review-form").getByRole("alert")).toBeVisible();

    await page.getByTestId("review-rating-4").check({ force: true });
    await page.getByTestId("review-body").fill("ตึกสะอาด ลิฟต์เร็ว โทรหานิติฯ 081-234-5678 ได้เลย");
    await consent.click();
    await expectAxeClean(page);
    await page.getByTestId("review-submit").click();
    await expect(page.getByTestId("review-form")).toContainText(text("th", "resident/reviews", "form.body.personal"));

    await page.getByTestId("review-body").fill("ตึกสะอาด ลิฟต์เร็ว นิติฯ ตอบไว แต่ที่จอดรถน้อยช่วงเย็น");
    await page.getByTestId("review-submit").click();
    await expect(page.getByTestId("review-sent")).toBeVisible();
    await expect(page.getByTestId("review-mine")).toHaveAttribute("data-state", "pending_moderation");
    await expectAxeClean(page);

    await moderate(page, leaseId, { decision: "approve", reply: "ขอบคุณสำหรับรีวิวค่ะ" });
    await page.reload();
    await expect(page.getByTestId("review-mine")).toHaveAttribute("data-state", "published");
    await expect(page.getByTestId("review-owner-reply")).toContainText("ขอบคุณสำหรับรีวิวค่ะ");

    await page.getByTestId("review-withdraw").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ถอนรีวิวถาวร", exact: true }).click();
    await expect(page.getByTestId("review-mine")).toHaveAttribute("data-state", "withdrawn");
    await expect(page.getByTestId("review-mine-body")).toHaveCount(0);
    await expect(page.getByTestId("review-withdraw")).toHaveCount(0);
  });

  test("a rejected review shows the moderator's reason", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("reviewer", "rejected"));
    await page.goto("/");
    const leaseId = await firstLeaseId(page);
    await page.goto(`/lease/${leaseId}/review`);
    await page.getByTestId("review-form-slot").scrollIntoViewIfNeeded();
    await page.getByTestId("review-consent-slot").scrollIntoViewIfNeeded();
    await page.getByTestId("review-rating-2").check({ force: true });
    await page.getByTestId("review-body").fill("ห้องข้างๆ เสียงดังทุกคืน แจ้งแล้วไม่มีใครมาดู");
    await page.getByTestId("review-consent").click();
    await page.getByTestId("review-submit").click();
    await moderate(page, leaseId, { decision: "reject", reason: "กล่าวถึงผู้พักอาศัยรายอื่น" });
    await page.reload();
    await expect(page.getByTestId("review-moderation-reason")).toContainText("กล่าวถึงผู้พักอาศัยรายอื่น");
  });
});

for (const locale of LOCALES) {
  test(`relocation and review screens in ${locale} at 360 × 780`, async ({ page, context, baseURL }) => {
    await useLocale(context, baseURL!, locale);
    await seedSession(context, baseURL!, subject("locale", locale, "moveout", "reviewed"));
    await page.goto("/relocation");
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(text(locale, "resident/relocation", "title"));
    // The consent text is published in Thai and English only: English for everyone but Thai readers.
    await expect(page.getByTestId("relocation-consent")).toContainText(locale === "th" ? CONSENT_TH : CONSENT_EN);
    await expect(page.getByTestId("relocation-consent-english")).toHaveCount(
      locale === "th" || locale === "en" ? 0 : 1,
    );
    await expectScriptFont(page, locale);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await page.getByTestId("relocation-consent-slot").scrollIntoViewIfNeeded();
    await page.getByTestId("relocation-consent-box").click();
    await page.getByTestId("relocation-consent-submit").click();
    await page.getByTestId("relocation-offer-link").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      text(locale, "resident/relocation", "offer.title"),
    );
    await page.getByTestId("relocation-destination-slot").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("relocation-destination-form")).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    const leaseId = await firstLeaseId(page);
    await page.goto(`/lease/${leaseId}/review`);
    await expect(page.getByTestId("review-mine")).toHaveAttribute("data-state", "published");
    await expect(page.getByTestId("review-mine")).toContainText(text(locale, "resident/reviews", "mine.reply"));
    await expectScriptFont(page, locale);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test(`the review form in ${locale}: the consent text as published (th / en)`, async ({ page, context, baseURL }) => {
    await useLocale(context, baseURL!, locale);
    await seedSession(context, baseURL!, subject("locale", locale, "reviewer"));
    await page.goto("/");
    const leaseId = await firstLeaseId(page);
    await page.goto(`/lease/${leaseId}/review`);
    await page.getByTestId("review-form-slot").scrollIntoViewIfNeeded();
    await page.getByTestId("review-consent-slot").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("review-consent-text")).toContainText(locale === "th" ? REVIEW_TH : REVIEW_EN);
    await expect(page.getByTestId("review-consent")).toHaveAttribute("aria-checked", "false");
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });
}
