import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, forceProblems, seedSession, subject } from "./support";

/**
 * GL1 — recommended places (api G6, D-300): a separate, optional consent with the purpose and profiling note exactly
 * as the API returns it, never pre-ticked; preferences (areas, budget, kind, move-in, language, quiet hours); one-tap
 * withdrawal; what was sent. `/recommendations` (the LINE message's link) serves residents and sends everyone else to
 * the prospect screen. The screen in all six locales at 360 × 780.
 *
 * Written for GL1; not run (founder 2026-10-28: web/LIFF e2e runs deferred).
 */
const LOCALES = ["th", "en", "my", "km", "lo", "zh"] as const;
type Locale = (typeof LOCALES)[number];

const copy = (locale: Locale) =>
  JSON.parse(
    readFileSync(join(__dirname, "../src/i18n/messages", locale, "shared/recommendations.json"), "utf8"),
  ) as Record<string, unknown>;
const text = (locale: Locale, path: string) =>
  path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], copy(locale)) as string;

/** Signed in as a prospect without the LIFF flow (mock seed refresh token, like Lighthouse). */
async function seedProspect(context: BrowserContext, baseURL: string, sub: string) {
  await context.addCookies([
    {
      name: "__Host-gp_prt",
      value: `mock-rt.seed-prospect.${sub}`,
      domain: new URL(baseURL).hostname,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/** D-179: the form loads as it comes near the screen. */
async function openForm(page: Page) {
  await page.getByTestId("recommendations-form-slot").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("recommendations-form")).toBeVisible();
}

test.describe("recommended places (GL1, D-300)", () => {
  test("a resident opts in from the profile: text as the API says it, never pre-ticked, then stops in one tap", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("recs"));
    await page.goto("/profile");
    await expect(page.getByTestId("profile-recommendations")).toHaveAttribute("data-state", "off");
    await page.getByTestId("profile-recommendations").click();
    await expect(page).toHaveURL(/\/recommendations$/);
    await expect(page.getByTestId("recommendations")).toHaveAttribute("data-audience", "resident");
    await expect(page.getByTestId("recommendations-status")).toContainText("ยังไม่ได้รับห้องแนะนำ");
    await expect(page.getByTestId("recommendations-consent")).toContainText("รับห้องแนะนำจาก getproperty (รวมโฆษณา)");
    await expect(page.getByTestId("recommendations-consent-body")).toContainText("การจัดกลุ่ม (profiling)");
    await expect(page.getByTestId("recommendations-limits")).toContainText("21:00–08:00");
    await expect(page.getByTestId("recommendations-withdraw")).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await openForm(page);
    await expect(page.getByTestId("recommendations-accept")).toHaveAttribute("aria-checked", "false");
    await page.getByTestId("recommendations-area-search").fill("อารี");
    await page.getByTestId("recommendations-area-option").first().click();
    await expect(page.getByTestId("recommendations-area-chosen")).toHaveAttribute("data-slug", "ari");
    await page.getByTestId("recommendations-budget-min").fill("8000");
    await page.getByTestId("recommendations-budget-max").fill("15000");
    await page.locator('[data-testid="recommendations-kind"][data-kind="condo_unit"]').click();
    await page.getByTestId("recommendations-quiet-mode").selectOption("own");
    await page.getByTestId("recommendations-quiet-start").fill("22:00");
    await page.getByTestId("recommendations-quiet-end").fill("07:00");

    // Without the tick nothing is sent.
    await page.getByTestId("recommendations-submit").click();
    await expect(page.getByTestId("recommendations-accept-card")).toContainText("ติ๊กช่องยินยอมก่อน");
    await page.getByTestId("recommendations-accept").click();
    await page.getByTestId("recommendations-submit").click();
    await expect(page).toHaveURL(/\/recommendations\?saved=1$/);
    await expect(page.getByTestId("recommendations")).toHaveAttribute("data-state", "on");
    await expect(page.getByTestId("recommendations-saved")).toBeVisible();
    await expect(page.getByTestId("recommendations-limits")).toContainText("22:00–07:00");
    await expectAxeClean(page);

    await page.getByTestId("recommendations-withdraw").click();
    await expect(page).toHaveURL(/\/recommendations\?stopped=1$/);
    await expect(page.getByTestId("recommendations")).toHaveAttribute("data-state", "off");
    await expect(page.getByTestId("recommendations-stopped")).toBeVisible();
    await page.goto("/profile");
    await expect(page.getByTestId("profile-recommendations")).toHaveAttribute("data-state", "off");
  });

  test("the LINE message's link sends someone signed in only as a prospect to the prospect screen", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedProspect(context, baseURL!, subject("prospect", "recs"));
    await page.goto("/recommendations");
    await expect(page).toHaveURL(/\/rent\/recommendations$/);
    await expect(page.getByTestId("recommendations")).toHaveAttribute("data-audience", "prospect");
    await openForm(page);
    await page.getByTestId("recommendations-accept").click();
    await page.getByTestId("recommendations-submit").click();
    await expect(page).toHaveURL(/\/rent\/recommendations\?saved=1$/);
    await page.goto("/rent/enquiries");
    await expect(page.getByTestId("enquiries-recommendations")).toHaveAttribute("data-state", "on");
  });

  test("a new text version asks again, and an unknown area is shown at the field", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedProspect(context, baseURL!, subject("prospect", "recs", "v2"));
    await page.goto("/rent/recommendations");
    await openForm(page);
    await page.getByTestId("recommendations-accept").click();
    await page.getByTestId("recommendations-submit").click();
    await expect(page.getByTestId("recommendations")).toHaveAttribute("data-state", "on");

    await forceProblems(context, baseURL!, { "recommendations.version": "2" });
    await page.goto("/rent/recommendations");
    await expect(page.getByTestId("recommendations")).toHaveAttribute("data-state", "outdated");
    await expect(page.getByTestId("recommendations-consent-version")).toContainText("2");
    await openForm(page);
    await expect(page.getByTestId("recommendations-accept")).toHaveAttribute("aria-checked", "false");
    await page.getByTestId("recommendations-accept").click();
    await page.getByTestId("recommendations-submit").click();
    await expect(page.getByTestId("recommendations")).toHaveAttribute("data-state", "on");

    // An area the API no longer lists (forced by the request): answered at the field, nothing saved.
    await page.route("**/bff/v1/prospect/me/recommendations", async (route) => {
      if (route.request().method() !== "PUT") return route.continue();
      const body = route.request().postDataJSON() as { preferences: { areas: string[] } };
      await route.continue({
        postData: JSON.stringify({ ...body, preferences: { ...body.preferences, areas: ["atlantis"] } }),
      });
    });
    await openForm(page);
    await page.getByTestId("recommendations-submit").click();
    await expect(page.getByTestId("recommendations-areas")).toContainText("ไม่มีในรายชื่อแล้ว");
  });

  test("what was sent: ad label, sponsor, a listing no longer public, paged", async ({ page, context, baseURL }) => {
    await seedProspect(context, baseURL!, subject("prospect", "adsseen"));
    await page.goto("/rent/recommendations");
    await expect(page.getByTestId("recommendations-history-item")).toHaveCount(3);
    await expect(page.getByTestId("recommendations-history-item").first()).toContainText("โฆษณา");
    await expect(page.getByTestId("recommendations-history-item").first()).toContainText("มาลี มีสุข");
    await page.getByTestId("recommendations-history-all").click();
    await expect(page).toHaveURL(/\/rent\/recommendations\/history$/);
    await expect(page.getByTestId("recommendations-history-item")).toHaveCount(4);
    await expect(page.getByTestId("recommendations-history-page")).toContainText("ไม่ได้ประกาศแล้ว");
    await expectAxeClean(page);
  });

  test("nothing sent yet says so", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("recs", "empty"));
    await page.goto("/recommendations");
    await expect(page.getByTestId("recommendations-history-empty")).toBeVisible();
  });

  for (const locale of LOCALES) {
    test(`the recommendations screen in ${locale} at 360 × 780`, async ({ page, context, baseURL }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await context.addCookies([{ name: "gp_locale", value: locale, url: baseURL! }]);
      await seedSession(context, baseURL!, subject("recs", "adsseen", locale));
      await page.goto("/recommendations");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(text(locale, "title"));
      await expect(page.getByTestId("recommendations-status")).toContainText(text(locale, "status.off.title"));
      // The consent text: Thai for Thai readers, English for everyone else, with a note for my/km/lo/zh.
      await expect(page.getByTestId("recommendations-consent-english")).toHaveCount(
        locale === "th" || locale === "en" ? 0 : 1,
      );
      await openForm(page);
      await expect(page.getByTestId("recommendations-submit")).toHaveText(text(locale, "form.submitOff"));
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);

      await page.getByTestId("recommendations-history-all").click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(text(locale, "history.title"));
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    });
  }
});
