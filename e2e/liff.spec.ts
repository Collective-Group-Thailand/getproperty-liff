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
 * L1 1.2 — LIFF login and account linking on the fake LIFF and the contract mocks (360 × 780): the id token is
 * exchanged through the BFF for httpOnly cookies and the resident lands on the deep-link target, through consent
 * and invitation acceptance when needed.
 */
test.describe("LIFF entry", () => {
  test("inside LINE: init → login → session → home, with httpOnly cookies only", async ({ page, context, baseURL }) => {
    await fakeLiff(context, baseURL!, { sub: subject("inclient"), name: "สมชาย ใจดี" });
    await page.goto("/liff");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("resident-home").getByRole("heading", { level: 1 })).toHaveText("สวัสดี สมชาย ใจดี");
    await expect(page.getByTestId("header-unit")).toHaveText("ห้อง A-201");
    await expect(page.getByTestId("header-building")).toHaveText("อาคาร A");

    // The session pair, plus (once the realtime bridge authorised its stream) the 60-s stream-token cookie (review L5).
    expect((await sessionCookieNames(context)).filter((name) => name !== "__Host-gp_sst")).toEqual([
      "__Host-gp_at",
      "__Host-gp_rt",
    ]);
    for (const cookie of (await context.cookies()).filter((c) => c.name.startsWith("__Host-gp_"))) {
      expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: "Lax", path: "/" });
    }
    // Nothing token-like is readable by page scripts.
    const visible = await page.evaluate(() =>
      [document.cookie, JSON.stringify(localStorage), JSON.stringify(sessionStorage)].join(" "),
    );
    expect(visible).not.toMatch(/gp_at|gp_rt|fake-line\.|eyJ/);
    await expectNoHorizontalScroll(page);
  });

  test("outside LINE: hands over to LINE Login (fake) and comes back signed in", async ({ page, context, baseURL }) => {
    await fakeLiff(context, baseURL!, { sub: subject("outside"), loggedIn: false, inClient: false, os: "web" });
    await page.goto("/liff?liff.state=%2F");
    await expect(page.getByTestId("resident-home")).toBeVisible();
    const fake = (await context.cookies()).find((c) => c.name === "gp_fake_liff");
    expect(decodeURIComponent(fake!.value)).toContain('"loggedIn":true');
  });

  test("first use asks for PDPA consent; required purposes must be accepted (D-025)", async ({
    page,
    context,
    baseURL,
  }) => {
    await fakeLiff(context, baseURL!, { sub: subject("newcomer") });
    await page.goto("/liff");
    await expect(page).toHaveURL(/\/consent$/);
    const form = page.getByTestId("consent-form");
    await expect(form.getByRole("heading", { level: 1 })).toHaveText("การใช้ข้อมูลส่วนบุคคล");
    await expect(form.locator("[data-purpose]")).toHaveCount(2);
    await expectAxeClean(page);

    await page.getByTestId("consent-submit").click();
    await expect(page.getByText("ต้องยินยอมในหัวข้อที่จำเป็นก่อนจึงจะใช้งานได้")).toBeVisible();

    await form.locator('[data-purpose="resident.service"]').getByRole("checkbox").click();
    await page.getByTestId("consent-submit").click();
    await expect(page.getByTestId("resident-home")).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("an invitation deep link asks for consent first, then links the unit, then home (D-025, D-061)", async ({
    page,
    context,
    baseURL,
  }) => {
    await fakeLiff(context, baseURL!, { sub: subject("invitee") });
    await page.goto("/liff?liff.state=%2Flink%3Fcode%3DOK-7KQ2M9");
    await expect(page).toHaveURL(/\/consent\?next=%2Flink%3Fcode%3DOK-7KQ2M9$/);
    await page.locator('[data-purpose="resident.service"]').getByRole("checkbox").click();
    await page.getByTestId("consent-submit").click();
    await expect(page).toHaveURL(/\/link\?code=OK-7KQ2M9$/);
    await expect(page.getByRole("textbox", { name: "รหัสคำเชิญ" })).toHaveValue("OK-7KQ2M9");
    await expectAxeClean(page);
    await page.getByTestId("link-submit").click();

    const success = page.getByTestId("link-success");
    await expect(success.getByText("ห้อง A-201 · อาคาร A")).toBeVisible();
    await page.getByTestId("link-continue").click();
    await expect(page.getByTestId("header-unit")).toHaveText("ห้อง A-201");
  });

  test("an expired or used invitation says so; an unknown one too", async ({ page, context, baseURL }) => {
    // A resident who already consented (a second unit): the code is checked straight away.
    await fakeLiff(context, baseURL!, { sub: subject("linker") });
    await page.goto("/liff?liff.state=%2Flink%3Fcode%3DEXPIRED-9X3L1C");
    await page.getByTestId("link-submit").click();
    await expect(page.getByText("รหัสนี้ใช้ไม่ได้แล้ว")).toBeVisible();

    await page.getByRole("textbox", { name: "รหัสคำเชิญ" }).fill("NOPE-12345");
    await page.getByTestId("link-submit").click();
    await expect(page.getByText("ไม่พบรหัสคำเชิญนี้")).toBeVisible();
    await expectAxeClean(page);
  });

  test("a disabled account stops at the sign-in step with the reason and a way out", async ({
    page,
    context,
    baseURL,
  }) => {
    await fakeLiff(context, baseURL!, { sub: subject("disabled") });
    await page.goto("/liff");
    const entry = page.getByTestId("liff-entry");
    await expect(entry).toHaveAttribute("data-status", "error");
    await expect(entry.locator('[data-step="session"]')).toHaveAttribute("data-state", "failed");
    await expect(page.getByText("บัญชีนี้ถูกระงับ กรุณาติดต่อผู้ดูแลอาคาร")).toBeVisible();
    await expect(page.getByRole("link", { name: "เข้าสู่ระบบด้วย SMS แทน" })).toHaveAttribute("href", "/auth");
    await expectAxeClean(page);
    expect(await sessionCookieNames(context)).toEqual([]);
  });

  test("shows the API's request id when the exchange fails unexpectedly", async ({ page, context, baseURL }) => {
    await fakeLiff(context, baseURL!, { sub: subject("boom") });
    await forceProblems(context, baseURL!, { "auth.residentLine.exchange": "internal.unexpected" });
    await page.goto("/liff");
    await expect(page.getByTestId("liff-entry")).toHaveAttribute("data-status", "error");
    await expect(page.getByText(/รหัสคำขอ: [0-9a-f-]{36}/)).toBeVisible();
  });

  test("never redirects off-site from liff.state", async ({ page, context, baseURL }) => {
    await fakeLiff(context, baseURL!, { sub: subject("offsite") });
    await page.goto("/liff?liff.state=%2F%2Fevil.example");
    await expect(page.getByTestId("resident-home")).toBeVisible();
    expect(new URL(page.url()).host).toBe(new URL(baseURL!).host);
  });

  test("remembers LINE's language until the API's language replaces it", async ({ page, context, baseURL }) => {
    await fakeLiff(context, baseURL!, { sub: subject("lang"), language: "en-US" });
    await page.goto("/liff");
    await expect(page.getByTestId("resident-home")).toBeVisible();
    // The mock resident's `/v1/resident/me.language` is th: it wins once signed in (L1 1.2 §6).
    const cookie = (await context.cookies()).find((c) => c.name === "gp_locale");
    expect(cookie?.value).toBe("th");
    await expect(page.locator("html")).toHaveAttribute("lang", "th");
  });

  test("the LIFF endpoint itself is axe-clean while it works", async ({ page, context, baseURL }) => {
    await fakeLiff(context, baseURL!, { sub: subject("disabled", "axe") });
    await page.goto("/liff");
    await expect(page.getByTestId("liff-entry")).toHaveAttribute("data-status", "error");
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
  });
});
