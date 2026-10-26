import { expect, test } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, fakeLiff, forceProblems, seedSession, subject } from "./support";

/** B7.11 — the portable rent record (D-256): mine to see, share with one enquiry, or give as a letter; revocable. */
const LISTING = "/rent/condo-1br-a1b2c3d4e5";

test.describe("rent record (D-256)", () => {
  test("a resident sees the record, gives a letter whose code shows once, then stops sharing it", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("record"));
    await page.goto("/profile");
    await page.getByTestId("profile-rent-record").click();
    await expect(page).toHaveURL(/\/profile\/rent-record$/);
    await expect(page.getByTestId("rent-record-on_time")).toContainText("10 เดือน");
    await expect(page.getByTestId("rent-record-late")).toContainText("1 เดือน");
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);

    await page.getByTestId("rent-record-new-letter").click();
    await expect(page.getByTestId("rent-record-code-value")).toHaveText(/^[2-9A-HJKMNP-TV-Z]{10}$/);
    const share = page.getByTestId("rent-record-share").first();
    await expect(share).toHaveAttribute("data-state", "live");
    await share.getByTestId("rent-record-stop").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "หยุดแชร์" }).click();
    await expect(page.getByTestId("rent-record-share").first()).toHaveAttribute("data-state", "revoked");
  });

  test("without a confirmed month there is nothing to share yet", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("record", "empty"));
    await forceProblems(context, baseURL!, { "rent_record.none": "1" });
    await page.goto("/profile/rent-record");
    await expect(page.getByTestId("rent-record-empty")).toBeVisible();
    await expect(page.getByTestId("rent-record-new-letter")).toHaveCount(0);
  });

  test("a prospect shares the record with one enquiry after agreeing, and can stop", async ({
    page,
    context,
    baseURL,
  }) => {
    await fakeLiff(context, baseURL!, { sub: subject("prospect", "record"), name: "Ploy" });
    await page.goto(`/liff?liff.state=${encodeURIComponent(LISTING)}`);
    await page.getByTestId("prospect-message").fill("สนใจห้องนี้ค่ะ");
    await page.getByTestId("prospect-consent").click();
    await page.getByTestId("prospect-submit").click();
    await expect(page).toHaveURL(/\/rent\/enquiries\/[0-9a-f-]+\?done=sent$/);

    const panel = page.getByTestId("enquiry-rent-record");
    await expect(panel).toContainText("ตรงเวลา 10");
    await expect(panel.getByTestId("enquiry-rent-record-share")).toBeDisabled();
    await panel.getByTestId("enquiry-rent-record-consent").click();
    await panel.getByTestId("enquiry-rent-record-share").click();
    await expect(panel).toHaveAttribute("data-shared", "true");
    await expectAxeClean(page);
    await panel.getByTestId("enquiry-rent-record-stop").click();
    await expect(panel).not.toHaveAttribute("data-shared", "true");

    await page.goto("/rent/enquiries");
    await page.getByTestId("enquiries-rent-record").click();
    await expect(page.getByTestId("rent-record-share").first()).toHaveAttribute("data-state", "revoked");
  });
});
