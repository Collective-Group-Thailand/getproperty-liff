import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, forceProblems, subject } from "./support";

/**
 * GL2 — self-viewing for prospects (api G7, D-295): off by default (a proper "not offered" state); with the setting
 * on (`gp_mock` `viewing.self=on`) the prospect verifies identity (fake e-KYC) and phone (SMS code), accepts the
 * visitor terms (never pre-ticked) and requests a self slot; the owner confirms (mock); inside the window the door
 * code is fetched on tap with `no-store`, never kept in storage and dropped when the page is hidden; arrive, report a
 * problem, leave. Accompanied viewings show who shows the room. The new screens in all six locales at 360 × 780.
 *
 * Written for GL2; not run (founder 2026-10-28: web/LIFF e2e runs deferred).
 */
const SLUG = "condo-1br-a1b2c3d4e5";
const LISTING = `/rent/${SLUG}`;
const BOOKING = `${LISTING}/self-viewing`;
const PROVIDER = "https://ekyc.example.test/**";
const LOCALES = ["th", "en", "my", "km", "lo", "zh"] as const;
type Locale = (typeof LOCALES)[number];
const FAMILY: Partial<Record<Locale, string>> = {
  my: "GP Noto Sans Myanmar",
  km: "GP Noto Sans Khmer",
  lo: "GP Noto Sans Lao",
  zh: "GP Noto Sans SC",
};

const copy = (locale: Locale) =>
  JSON.parse(
    readFileSync(join(__dirname, "../src/i18n/messages", locale, "prospect/selfViewing.json"), "utf8"),
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

/** The owner confirms the viewing in the mock (`{ window: "now" }` opens the door-code window at once). */
async function ownerConfirms(page: Page, leadId: string, window: "now" | "slot" = "now") {
  const origin = new URL(page.url()).origin;
  const enquiry = await (await page.request.get(`/bff/v1/prospect/enquiries/${leadId}`)).json();
  const viewingId = (enquiry as { viewings: { id: string }[] }).viewings[0]!.id;
  const response = await page.request.post(`/bff/v1/prospect/__mock/viewings/${viewingId}/confirm`, {
    headers: { "x-getproperty-csrf": "1", origin },
    data: { window },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

test.describe("self-viewing (GL2, D-295)", () => {
  test("is not offered while the platform has it off", async ({ page, context, baseURL }) => {
    await seedProspect(context, baseURL!, subject("prospect", "gl2off"));
    await page.goto(`${LISTING}?mode=book`);
    await expect(page.getByTestId("prospect-contact")).toBeVisible();
    await expect(page.getByTestId("self-offer")).toHaveCount(0);
    await page.goto(BOOKING);
    await expect(page.getByTestId("self-viewing")).toHaveAttribute("data-offered", "false");
    await expect(page.getByTestId("self-unavailable")).toContainText(text("th", "unavailable.title"));
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    await page.getByTestId("self-unavailable-book").click();
    await expect(page).toHaveURL(/\?mode=book$/);
  });

  test("verifies identity and phone, accepts the terms, books, and uses the door code inside the window", async ({
    page,
    context,
    baseURL,
  }) => {
    await page.route(PROVIDER, (route) => route.fulfill({ contentType: "text/html", body: "<h1>Provider</h1>" }));
    await forceProblems(context, baseURL!, { "viewing.self": "on" });
    await seedProspect(context, baseURL!, subject("prospect", "gl2book"));

    // The listing offers self times on their own page; the accompanied picker shows none of them.
    await page.goto(`${LISTING}?mode=book`);
    await page.getByTestId("self-offer-open").click();
    await expect(page).toHaveURL(new RegExp(`${BOOKING}$`));
    await expect(page.getByTestId("self-viewing")).toHaveAttribute("data-offered", "true");
    await expect(page.getByTestId("self-submit")).toBeDisabled();
    await page.getByTestId("self-terms-accept-slot").scrollIntoViewIfNeeded();
    await expect(page.getByTestId("self-terms-accept")).not.toBeChecked();
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);

    // 1. identity: the B7.10 flow, back to the booking
    await page.getByTestId("self-verify-identity").click();
    await expect(page).toHaveURL(/\/rent\/verification\?next=/);
    await page.getByTestId("verification-start").click();
    await expect(page).toHaveURL(/^https:\/\/ekyc\.example\.test\//);
    await forceProblems(context, baseURL!, { "viewing.self": "on", "ekyc.decide": "approved" });
    // The provider sends everyone back to the API's fixed page — no `next` (review G, L5): the booking is remembered.
    await page.goto(`${baseURL}/rent/verification`);
    await expect(page.getByTestId("verification")).toHaveAttribute("data-state", "verified");
    await expect(page.getByTestId("back-link")).toHaveAttribute("href", BOOKING);
    await expect(page.getByTestId("back-link")).toHaveText(text("th", "backToBooking"));
    await page.getByTestId("back-link").click();
    await expect(page.getByTestId("self-step-identity")).toHaveAttribute("data-done", "true");

    // 2. phone: SMS code (mock code 123456)
    await page.getByTestId("self-step-phone").getByRole("textbox").first().fill("0810001234");
    await page.getByTestId("self-phone-send").click();
    await page.getByTestId("self-phone-code").getByRole("textbox").first().pressSequentially("123456");
    await expect(page.getByTestId("self-step-phone")).toHaveAttribute("data-done", "true");

    // 3. a self time, 4. the terms (as returned, Thai for Thai), consent on the first contact
    await page.getByTestId("self-slots").getByTestId("slot-time").first().click();
    await expect(page.getByTestId("self-terms")).toContainText("ร่างเงื่อนไขผู้เข้าชม");
    // D-179: the checkbox loads as it comes near the screen
    await page.getByTestId("self-terms-accept-slot").scrollIntoViewIfNeeded();
    await page.getByTestId("self-terms-accept").click();
    // D-179: the checkbox loads as it comes near the screen
    await page.getByTestId("self-consent-slot").scrollIntoViewIfNeeded();
    await page.getByTestId("self-consent").click();
    const booked = page.waitForRequest((r) => r.method() === "POST" && r.url().endsWith(`/listings/${SLUG}/viewings`));
    await page.getByTestId("self-submit").click();
    expect((await booked).postDataJSON()).toMatchObject({ mode: "self", visitorTermsVersion: 1, consent: true });
    await expect(page).toHaveURL(/\/rent\/enquiries\/[0-9a-f-]+\?done=booked$/);
    const leadId = /enquiries\/([0-9a-f-]+)/.exec(page.url())![1]!;
    await expect(page.getByTestId("viewing-mode")).toHaveAttribute("data-mode", "self");
    await expect(page.getByTestId("self-waiting")).toBeVisible();

    // The owner confirms; the window is open now. The code comes only on tap, with no-store, never stored.
    await ownerConfirms(page, leadId, "now");
    await page.reload();
    await expect(page.getByTestId("self-access")).toHaveAttribute("data-phase", "open");
    await expect(page.getByTestId("self-door-code")).toHaveCount(0);
    const codeResponse = page.waitForResponse((r) => r.url().includes("/access-code"));
    await page.getByTestId("self-show-code").click();
    expect((await codeResponse).headers()["cache-control"]).toBe("no-store");
    await expect(page.getByTestId("self-door-code")).toHaveText(/^\d{6}$/);
    const code = await page.getByTestId("self-door-code").textContent();
    const stored = await page.evaluate(
      () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
    );
    expect(stored).not.toContain(code!);
    await expectAxeClean(page);

    // Hidden page → the code is dropped.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByTestId("self-door-code")).toHaveCount(0);

    // Arrive, report a problem (once), leave.
    await page.getByTestId("self-arrive").click();
    await expect(page.getByTestId("self-access")).toHaveAttribute("data-state", "entered");
    await expect(page.getByTestId("viewing-reschedule")).toHaveCount(0);
    await page.getByTestId("self-report").click();
    await page.getByTestId("self-report-note").fill("ก๊อกน้ำในห้องน้ำรั่ว");
    await page.getByTestId("self-report-send").click();
    await expect(page.getByTestId("self-incident-reported")).toBeVisible();
    await expect(page.getByTestId("self-report")).toHaveCount(0);
    await page.getByTestId("self-leave").click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: text("th", "access.leaveConfirm") })
      .click();
    await expect(page).toHaveURL(/\?done=left$/);
    await expect(page.getByTestId("enquiry-done")).toContainText(text("th", "panel.left"));
    await expect(page.getByTestId("live-viewing")).toHaveCount(0);
    await expectAxeClean(page);
  });

  test("a code asked for outside its window is kept back and the window is said plainly", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedProspect(context, baseURL!, subject("prospect", "selfview", "early"));
    await forceProblems(context, baseURL!, {
      "viewing.self": "on",
      "prospect.selfViewing.accessCode": "viewing.code_not_available",
    });
    await page.goto("/rent/enquiries");
    await page.getByTestId("enquiry-item").first().click();
    await page.getByTestId("self-show-code").click();
    await expect(page.getByTestId("self-access")).toContainText(text("th", "access.notYetTitle"));
    await expect(page.getByTestId("self-door-code")).toHaveCount(0);
    await expectAxeClean(page);
  });

  test("an accompanied viewing shows who shows the room and how to reach them", async ({ page, context, baseURL }) => {
    await seedProspect(context, baseURL!, subject("prospect", "gl2host"));
    await page.goto(`${LISTING}?mode=book`);
    await page.getByTestId("slot-time").first().click();
    // D-179: the checkbox loads as it comes near the screen
    await page.getByTestId("prospect-consent-slot").scrollIntoViewIfNeeded();
    await page.getByTestId("prospect-consent").click();
    await page.getByTestId("prospect-submit").click();
    await expect(page).toHaveURL(/\?done=booked$/);
    await expect(page.getByTestId("viewing-mode")).toHaveAttribute("data-mode", "accompanied");
    await expect(page.getByTestId("viewing-host")).toContainText("มาลี มีสุข");
    await expect(page.getByTestId("viewing-host-message")).toHaveAttribute("href", "#enquiry-thread");
    await expectAxeClean(page);
  });

  for (const locale of LOCALES) {
    test(`the self-viewing screens in ${locale} at 360 × 780`, async ({ page, context, baseURL }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await context.addCookies([{ name: "gp_locale", value: locale, url: baseURL! }]);
      await forceProblems(context, baseURL!, { "viewing.self": "on" });
      // `selfview`: verified, with a confirmed self viewing whose window is open now
      await seedProspect(context, baseURL!, subject("prospect", "selfview", locale));

      await page.goto(BOOKING);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(text(locale, "title"));
      await expect(page.getByTestId("self-step-identity")).toContainText(text(locale, "book.identity.title"));
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);

      await page.goto("/rent/enquiries");
      await page.getByTestId("enquiry-item").first().click();
      await expect(page.getByTestId("viewing-mode")).toContainText(text(locale, "panel.mode.self"));
      await expect(page.getByTestId("self-show-code")).toHaveText(text(locale, "access.show"));
      await page.getByTestId("self-show-code").click();
      await expect(page.getByTestId("self-door-code")).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
      const family = FAMILY[locale];
      if (family) {
        const loaded = await page.evaluate(async (name) => {
          await document.fonts.ready;
          return [...document.fonts].filter((f) => f.family.replace(/"/g, "") === name && f.status === "loaded").length;
        }, family);
        expect(loaded).toBeGreaterThan(0);
      }

      await forceProblems(context, baseURL!, {});
      await page.goto(BOOKING);
      await expect(page.getByTestId("self-unavailable")).toContainText(text(locale, "unavailable.title"));
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    });
  }
});
