import { expect, test, type Page } from "@playwright/test";

import {
  expectAxeClean,
  expectNoHorizontalScroll,
  mockOwnerConfirmsLink,
  mockOwnerDecidesLink,
  seedSession,
  sessionCookieNames,
  subject,
} from "./support";

/**
 * L1 1.2 — signing in outside LINE (SMS code / magic link, D-060), guards, sign-out, and the audience boundary:
 * a cookie from getproperty-web (another host, another audience) never authenticates here.
 */
/** The LIFF view goes to the background: the realtime bridge closes its stream (it reopens when visible again). */
async function hideView(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test.describe("outside LINE", () => {
  test("a signed-out visitor is sent to the sign-in page; inside LINE to the LIFF endpoint", async ({
    browser,
    baseURL,
  }) => {
    const web = await browser.newContext({ baseURL });
    const page = await web.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth$/);
    await expect(page.getByTestId("open-in-line")).toHaveAttribute("href", "/liff?liff.state=%2F");
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    await web.close();

    const line = await browser.newContext({
      baseURL,
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36 Line/14.19.1",
    });
    const inLine = await line.newPage();
    const response = await inLine.request.get("/link?code=OK-1234", { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe("/liff?liff.state=%2Flink%3Fcode%3DOK-1234");
    await line.close();
  });

  test("signs in with an SMS code: wrong code → tries left, right code → waits for the Owner (D-226) → home", async ({
    page,
    context,
  }) => {
    await page.goto("/auth?next=%2F");
    await page.getByLabel("เบอร์มือถือ").fill("0810001234");
    await page.getByTestId("send-code").click();

    await expect(page).toHaveURL(/\/auth\/otp\?c=[0-9a-f-]{36}/);
    await expect(page.getByText("ถ้าเบอร์ 081-000-1234 อยู่ในระบบ")).toBeVisible();
    await expectAxeClean(page);

    await page.getByLabel("หลักที่ 1").pressSequentially("999999");
    await expect(page.getByText("รหัสไม่ถูกต้อง ลองได้อีก 4 ครั้ง")).toBeVisible();

    await page.getByLabel("หลักที่ 1").pressSequentially("123456");
    await expect(page.getByTestId("resident-home")).toBeVisible();
    // D-226: the phone matches a party the office entered — nothing is linked until the landlord's Owner confirms.
    await expect(page.getByTestId("home-link-pending")).toContainText("รอผู้ดูแลอาคารยืนยัน");
    await expect(page.getByTestId("home-link-pending")).toContainText("ข้อมูลผู้พักอาศัย 1 รายการ");
    await expect(page.getByTestId("unit-card")).toHaveCount(0);
    await expect(page.getByTestId("home-invoice")).toHaveCount(0);
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    // No bills, lease or door codes while it waits.
    await page.goto("/access");
    await expect(page.getByTestId("access")).toHaveCount(0);
    await page.goto("/");

    // "Check again" before the Owner decides: read in place, still waiting — and it says so.
    await expect(page.locator("[data-testid=link-pending-watch][data-ready]")).toHaveCount(1);
    await page.getByTestId("home-link-pending-check").click();
    await expect(page.getByTestId("link-pending-status")).toHaveText(/ยังไม่ได้รับการยืนยัน/);
    await expect(page.getByTestId("home-link-pending")).toBeVisible();
    await expectAxeClean(page);

    // The Owner confirms while the stream is closed (LINE suspends hidden views); "check again" reads /me, the
    // session is rotated for the new scopes and the unit is there. (With the stream open it happens by itself.)
    await hideView(page);
    await mockOwnerConfirmsLink(page);
    await page.getByTestId("home-link-pending-check").click();
    await expect(page.getByTestId("header-unit")).toHaveText("ห้อง A-201");
    await expect(page.getByTestId("home-link-pending")).toHaveCount(0);
    await expect(page.getByTestId("home-invoice")).toBeVisible();
    expect((await context.cookies()).map((c) => c.name)).toContain("gp_rescoped");
    const me = await (await page.request.get("/bff/v1/resident/me")).json();
    expect(me.scopes).toContain("unit:3b241101-e2bb-4255-8caf-4136c566a962");
  });

  test("the pending card follows the Owner's confirmation by itself (realtime party.link_changed, D-228)", async ({
    page,
    context,
  }) => {
    await page.goto("/auth?next=%2F");
    await page.getByLabel("เบอร์มือถือ").fill("0810005678");
    await page.getByTestId("send-code").click();
    const stream = page.waitForResponse((r) => r.url().includes("/realtime/stream"));
    await page.getByLabel("หลักที่ 1").pressSequentially("123456");
    await expect(page.getByTestId("home-link-pending")).toBeVisible();
    // The realtime stream is open and the card's watcher is there; then the Owner confirms — no tap, no reload.
    await stream;
    await expect(page.locator("[data-testid=link-pending-watch][data-ready]")).toHaveCount(1);
    await mockOwnerConfirmsLink(page);
    await expect(page.getByTestId("header-unit")).toHaveText("ห้อง A-201", { timeout: 10_000 });
    await expect(page.getByTestId("home-link-pending")).toHaveCount(0);
    await expect(page.getByTestId("home-invoice")).toBeVisible();
    expect((await context.cookies()).map((c) => c.name)).toContain("gp_rescoped");
  });

  test("the Owner declines: the card says so and shows the way forward, in place (D-228)", async ({ page }) => {
    await page.goto("/auth?next=%2F");
    await page.getByLabel("เบอร์มือถือ").fill("0810006789");
    await page.getByTestId("send-code").click();
    const stream = page.waitForResponse((r) => r.url().includes("/realtime/stream"));
    await page.getByLabel("หลักที่ 1").pressSequentially("123456");
    await expect(page.getByTestId("home-link-pending")).toBeVisible();
    await stream;
    await expect(page.locator("[data-testid=link-pending-watch][data-ready]")).toHaveCount(1);
    await mockOwnerDecidesLink(page, "reject");
    const declined = page.getByTestId("home-link-declined");
    await expect(declined).toContainText("ผู้ดูแลอาคารไม่ได้ยืนยันการเข้าสู่ระบบนี้", { timeout: 10_000 });
    await expect(declined).toContainText("ติดต่อผู้ดูแลอาคาร");
    await expect(page.getByTestId("home-link-pending")).toHaveCount(0);
    await expect(declined.getByRole("link", { name: "กรอกรหัสคำเชิญ" })).toBeVisible();
    await expectAxeClean(page);
    await expectNoHorizontalScroll(page);
    // Later visits: nothing pending, no unit — the invitation code is the way in.
    await page.reload();
    await expect(page.getByTestId("home-link-pending")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "กรอกรหัสคำเชิญ" })).toBeVisible();
  });

  test("'check again' finds the decline when the stream was not open", async ({ page }) => {
    await page.goto("/auth?next=%2F");
    await page.getByLabel("เบอร์มือถือ").fill("0810007890");
    await page.getByTestId("send-code").click();
    await page.getByLabel("หลักที่ 1").pressSequentially("123456");
    await expect(page.locator("[data-testid=link-pending-watch][data-ready]")).toHaveCount(1);
    // A dropped stream (LINE suspends hidden views): the decision is found by the manual check.
    await hideView(page);
    await mockOwnerDecidesLink(page, "reject");
    await page.getByTestId("home-link-pending-check").click();
    await expect(page.getByTestId("home-link-declined")).toContainText("ผู้ดูแลอาคารไม่ได้ยืนยันการเข้าสู่ระบบนี้");
  });

  test("an SMS sign-in that matches nobody offers the invitation code", async ({ page }) => {
    await page.goto("/auth?next=%2F");
    await page.getByLabel("เบอร์มือถือ").fill("0820000000");
    await page.getByTestId("send-code").click();
    await page.getByLabel("หลักที่ 1").pressSequentially("123456");
    await expect(page.getByTestId("resident-home")).toBeVisible();
    await expect(page.getByTestId("home-link-pending")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "กรอกรหัสคำเชิญ" })).toBeVisible();
  });

  test("an expired code sends the resident back for a new one", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("เบอร์มือถือ").fill("0899999999");
    await page.getByTestId("send-code").click();
    await page.getByLabel("หลักที่ 1").pressSequentially("000000");
    await expect(page.getByTestId("verify-code")).toBeDisabled();
    await expect(page.getByRole("link", { name: "เปลี่ยนเบอร์" })).toBeVisible();
  });

  test("rejects a number that is not a Thai mobile before calling the API", async ({ page }) => {
    await page.goto("/auth");
    await page.getByLabel("เบอร์มือถือ").fill("12");
    await page.getByTestId("send-code").click();
    await expect(page.getByText("กรอกเบอร์มือถือ 10 หลัก")).toBeVisible();
  });

  test("the SMS link opened in another browser asks for a new code", async ({ page }) => {
    await page.goto("/auth/otp");
    await expect(page.getByText("ลิงก์นี้ใช้กับเบราว์เซอร์อื่นหรือหมดอายุแล้ว")).toBeVisible();
    await expectAxeClean(page);
  });
});

test.describe("session boundary", () => {
  test("an owner/staff cookie of getproperty-web never authenticates here", async ({ page, context, baseURL }) => {
    // 1. getproperty-web's cookies are host-only on its own host: this browser never sends them here.
    await context.addCookies([
      { name: "__Host-gp_at", value: "operator-token", domain: "127.0.0.1", path: "/", secure: true, httpOnly: true },
    ]);
    // 2. An operator-audience token on this host is refused by the resident surface.
    const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
    const operator = `${b64({ alg: "EdDSA" })}.${b64({ aud: "operator", sid: "x", sub: "y", exp: 4102444800 })}.sig`;
    await context.addCookies([
      {
        name: "__Host-gp_at",
        value: operator,
        domain: new URL(baseURL!).hostname,
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth$/);
    const bff = await page.request.get("/bff/v1/resident/me");
    expect(bff.status()).toBe(401);
  });

  test("signing out ends the session and clears every session cookie", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("signout"));
    await page.goto("/");
    await expect(page.getByTestId("resident-home")).toBeVisible();
    await page.getByTestId("settings-open").click();
    await page.getByTestId("sign-out").click();
    await expect(page.getByTestId("signed-out")).toBeVisible();
    expect(await sessionCookieNames(context)).toEqual([]);
    await expectAxeClean(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth$/);
  });

  test("the BFF answers only the resident's API and refuses cross-site writes", async ({ request }) => {
    for (const path of ["/bff/v1/owner/me", "/bff/v1/admin/me", "/bff/v1/staff/me", "/bff/v1/auth/refresh"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(404);
      expect((await response.json()).code).toBe("bff.not_allowed");
    }
    const csrf = await request.post("/bff/v1/resident/consents", {
      data: {},
      headers: { origin: "https://evil.example" },
    });
    expect(csrf.status()).toBe(403);
    expect(csrf.headers()["cache-control"]).toBe("no-store");
  });
});
