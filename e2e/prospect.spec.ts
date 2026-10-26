import { expect, test } from "@playwright/test";

import {
  expectAxeClean,
  expectNoHorizontalScroll,
  fakeLiff,
  forceProblems,
  sessionCookieNames,
  subject,
} from "./support";

/**
 * L5 5.1 — prospects (audience `prospect`, D-281): a deep link to a listing signs in through the LIFF entry as a
 * prospect; consent before the first contact; ask the owner; book a free time; a time taken a moment ago is said
 * plainly and the picker refreshes; change the time and cancel from "my enquiries".
 */
const LISTING = "/rent/condo-1br-a1b2c3d4e5";

test.describe("prospects (D-252, D-281)", () => {
  test("signs in from a listing deep link, asks the owner with consent, and books a viewing", async ({
    page,
    context,
    baseURL,
  }) => {
    await fakeLiff(context, baseURL!, { sub: subject("prospect"), name: "Daniel" });
    await page.goto(`/liff?liff.state=${encodeURIComponent(LISTING)}`);
    await expect(page).toHaveURL(new RegExp(`${LISTING}$`));
    expect(await sessionCookieNames(context)).toEqual(["__Host-gp_pat", "__Host-gp_prt"]);
    await expect(page.getByTestId("prospect-listing")).toContainText("คอนโด 1 ห้องนอน");
    // D-265: the real utility cost before asking — rates from the API and the average of real bills
    await expect(page.getByTestId("prospect-utility")).toContainText("฿7.00 ต่อหน่วย");
    await expect(page.getByTestId("prospect-utility")).toContainText("ขั้นต่ำ ฿100.00 ต่อเดือน");
    await expect(page.getByTestId("prospect-utility-average")).toContainText("฿1,240.50");
    await expect(page.getByRole("navigation", { name: "เมนูด่วน" })).toHaveCount(0);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);

    // The first contact needs consent: never pre-ticked, asked before anything is sent.
    await page.getByTestId("prospect-message").fill("ห้องยังว่างไหมคะ รับสัตว์เลี้ยงไหม");
    await page.getByTestId("prospect-submit").click();
    await expect(page.getByTestId("prospect-contact")).toContainText("โปรดให้ความยินยอมก่อนส่ง");
    await page.getByTestId("prospect-consent").click();
    await page.getByTestId("prospect-submit").click();
    await expect(page).toHaveURL(/\/rent\/enquiries\/[0-9a-f-]+\?done=sent$/);
    await expect(page.getByTestId("enquiry-done")).toBeVisible();
    await expect(page.getByTestId("enquiry-message")).toHaveCount(1);
    await expectAxeClean(page);

    // Back on the listing: the open enquiry continues; booking needs no new consent.
    await page.goto(`${LISTING}?mode=book`);
    await expect(page.getByTestId("prospect-consent")).toHaveCount(0);
    await page.getByTestId("slot-time").first().click();
    await page.getByTestId("prospect-submit").click();
    await expect(page).toHaveURL(/\?done=booked$/);
    await expect(page.getByTestId("live-viewing")).toHaveAttribute("data-state", "requested");
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);

    // Change the time, then cancel.
    await page.getByTestId("viewing-reschedule").click();
    await page.getByTestId("reschedule-slots").getByTestId("slot-time").nth(2).click();
    await page.getByTestId("reschedule-confirm").click();
    await expect(page.getByTestId("live-viewing")).toBeVisible();
    await page.getByTestId("viewing-cancel").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ยกเลิกนัด" }).click();
    await expect(page.getByTestId("live-viewing")).toHaveCount(0);

    await page.goto("/rent/enquiries");
    await expect(page.getByTestId("enquiry-item")).toHaveCount(1);
    await expectAxeClean(page);
  });

  test("a time taken a moment ago is said plainly, nothing is booked", async ({ page, context, baseURL }) => {
    await fakeLiff(context, baseURL!, { sub: subject("prospect", "race"), name: "Mai" });
    await page.goto(`/liff?liff.state=${encodeURIComponent(`${LISTING}?mode=book`)}`);
    await expect(page.getByTestId("prospect-contact")).toBeVisible();
    await forceProblems(context, baseURL!, { "prospect.viewings.request": "listing.viewing_slot_taken" });
    await page.getByTestId("slot-time").first().click();
    await page.getByTestId("prospect-consent").click();
    await page.getByTestId("prospect-submit").click();
    await expect(page.getByTestId("prospect-contact")).toContainText(/เพิ่งมีคนจอง|someone|booked/i);
    await expect(page).toHaveURL(/mode=book/);
  });

  test("outside LINE a listing asks to sign in with LINE and my enquiries need a session", async ({ page }) => {
    await page.goto(LISTING);
    await expect(page.getByTestId("prospect-signin-card")).toBeVisible();
    await page.goto("/rent/enquiries");
    await expect(page).toHaveURL(/\/rent\/sign-in\?next=%2Frent%2Fenquiries$/);
    await expect(page.getByTestId("prospect-open-in-line")).toBeVisible();
    await expectAxeClean(page);
  });
});

test.describe("sign-in outside LINE (B7.8, D-255, D-283)", () => {
  test("a prospect signs in by SMS code, and with Google through the test provider", async ({ page, context }) => {
    await page.goto("/rent/sign-in?next=%2Frent%2Fenquiries");
    const sheet = page.getByTestId("prospect-sign-in");
    await expect(sheet.getByTestId("oauth-buttons").getByRole("link")).toHaveCount(2);
    await expectAxeClean(page);

    await sheet.getByLabel(/เบอร์มือถือ|Mobile number/).fill("0812345678");
    await sheet.getByTestId("prospect-send-code").click();
    await expect(sheet.getByTestId("prospect-code")).toContainText("081");
    await sheet.getByRole("textbox", { name: /หลักที่ 1|Digit 1/ }).fill("123456");
    await expect(page).toHaveURL(/\/rent\/enquiries$/);
    expect(await sessionCookieNames(context)).toContain("__Host-gp_pat");

    await context.clearCookies();
    await page.goto("/rent/sign-in");
    await page.getByTestId("oauth-google").click();
    await page.getByTestId("oauth-fake-email").fill("");
    await page.getByTestId("oauth-fake-continue").click();
    await expect(page.getByTestId("oauth-error")).toHaveAttribute("data-code", "auth.identity_contact_required");
    await page.getByTestId("oauth-google").click();
    await page.getByTestId("oauth-fake-continue").click();
    await expect(page).toHaveURL(/\/rent\/enquiries$/);
  });

  test("a resident opens the app with Apple only once it is linked", async ({ page }) => {
    await page.goto("/auth");
    await page.getByTestId("oauth-apple").click();
    await page.getByTestId("oauth-fake-uid").fill("someone-new");
    await page.getByTestId("oauth-fake-continue").click();
    await expect(page.getByTestId("oauth-error")).toHaveAttribute("data-code", "auth.identity_not_linked");
    await expect(page.getByTestId("sign-in")).toBeVisible();

    await page.getByTestId("oauth-apple").click();
    await page.getByTestId("oauth-fake-cancel").click();
    await expect(page.getByTestId("oauth-error")).toHaveAttribute("data-code", "oauth.cancelled");

    await page.getByTestId("oauth-apple").click();
    await page.getByTestId("oauth-fake-uid").fill("linked-resident-1");
    await page.getByTestId("oauth-fake-continue").click();
    await expect(page).not.toHaveURL(/\/auth/);
  });
});
