import { expect, test } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, fakeLiff, forceProblems, seedSession, subject } from "./support";

/**
 * B7.10 part 2 — verified people (D-267, O-021): a resident (optional) and a prospect verify their identity at the
 * e-KYC provider. The provider's page is stood in for; its decision reaches the mock with `ekyc.decide`.
 */
const PROVIDER = "https://ekyc.example.test/**";

test.describe("identity verification (D-267)", () => {
  test("a resident starts from the profile, is refused once, tries again and is verified", async ({
    page,
    context,
    baseURL,
  }) => {
    await page.route(PROVIDER, (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Provider</title><h1>Provider</h1>" }),
    );
    await seedSession(context, baseURL!, subject("verify"));
    await page.goto("/profile");
    await page.getByTestId("profile-verification").click();
    await expect(page).toHaveURL(/\/profile\/verification$/);
    const panel = page.getByTestId("verification");
    await expect(panel).toHaveAttribute("data-state", "none");
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);

    await page.getByTestId("verification-start").click();
    await expect(page).toHaveURL(/^https:\/\/ekyc\.example\.test\/session\/fake-ekyc-/);

    await forceProblems(context, baseURL!, { "ekyc.decide": "rejected" });
    await page.goto(`${baseURL}/profile/verification`);
    await expect(panel).toHaveAttribute("data-state", "rejected");
    await expect(page.getByTestId("verification-reason")).toContainText("could not be read");

    await forceProblems(context, baseURL!, {});
    await page.getByTestId("verification-start").click();
    await expect(page).toHaveURL(/^https:\/\/ekyc\.example\.test\//);
    await page.goto(`${baseURL}/profile/verification`);
    await expect(panel).toHaveAttribute("data-state", "pending");
    await expect(page.getByTestId("verification-continue")).toHaveAttribute("href", /fake-ekyc-/);

    await forceProblems(context, baseURL!, { "ekyc.decide": "approved" });
    await page.getByTestId("verification-refresh").click();
    await expect(panel).toHaveAttribute("data-state", "verified");
    await expect(page.getByTestId("verification-verified")).toBeVisible();
    await expectAxeClean(page);

    await page.goto("/profile");
    await expect(page.getByTestId("profile-verification")).toContainText("ยืนยันตัวตนแล้ว");
  });

  test("a prospect verifies from my enquiries", async ({ page, context, baseURL }) => {
    await page.route(PROVIDER, (route) => route.fulfill({ contentType: "text/html", body: "<h1>Provider</h1>" }));
    await fakeLiff(context, baseURL!, { sub: subject("prospect", "verify"), name: "Nok" });
    await page.goto(`/liff?liff.state=${encodeURIComponent("/rent/enquiries")}`);
    await expect(page).toHaveURL(/\/rent\/enquiries$/);
    await page.getByTestId("enquiries-verification").click();
    await expect(page).toHaveURL(/\/rent\/verification$/);
    await expect(page.getByTestId("verification")).toHaveAttribute("data-state", "none");
    await expectAxeClean(page);
    await page.getByTestId("verification-start").click();
    await expect(page).toHaveURL(/^https:\/\/ekyc\.example\.test\//);

    await forceProblems(context, baseURL!, { "ekyc.decide": "approved" });
    await page.goto(`${baseURL}/rent/enquiries`);
    await expect(page.getByTestId("enquiries-verification")).toHaveAttribute("data-verified", "true");
  });
});
