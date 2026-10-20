import { expect, test } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, forceProblems, seedSession, subject } from "./support";

/**
 * L1 1.3 — the shell from `/v1/resident/me` (unit + building, unit switcher, bottom nav from entitlements), i18n,
 * error states with request ids, the per-request CSP nonce and the PWA basics.
 */
test.describe("resident shell", () => {
  test("home: greeting, unit card, entitled tiles and bottom nav; axe-clean; no sideways scroll", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("home"));
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    const html = page.locator("html");
    await expect(html).toHaveAttribute("lang", "th");
    await expect(html).toHaveAttribute("data-zone", "resident");
    await expect(html).not.toHaveAttribute("data-theme", /.+/);

    const home = page.getByTestId("resident-home");
    await expect(home.getByRole("heading", { level: 1 })).toHaveText("สวัสดี สมชาย ใจดี");
    await expect(page.getByTestId("unit-card")).toContainText("ห้อง A-201");
    await expect(page.getByTestId("unit-card")).toContainText("ดูแลโดย หอพักตัวอย่าง");
    // Mock entitlements: bills (bills + receipts tiles), usage, lease and the R2 modules (repairs, announcements,
    // parcels; facilities with the community module; door codes, house rules and contacts with the lease).
    for (const tile of [
      "บิล",
      "ใบเสร็จ",
      "การใช้น้ำไฟ",
      "แจ้งซ่อม",
      "สัญญาเช่า",
      "ประกาศ",
      "พัสดุ",
      "จองห้องส่วนกลาง",
      "รหัสประตู",
      "ระเบียบอาคาร",
      "เบอร์ติดต่อ",
    ])
      await expect(home.getByRole("link", { name: tile, exact: true })).toBeVisible();

    const nav = page.getByRole("navigation", { name: "เมนูด่วน" });
    await expect(nav.getByRole("link")).toHaveText(["หน้าแรก", "บิล", "การใช้", "แจ้งซ่อม", "ฉัน"]);
    await expect(nav.getByRole("link", { name: "หน้าแรก" })).toHaveAttribute("aria-current", "page");
    // A single unit is plain text, not a switcher.
    await expect(page.getByTestId("unit-switcher")).toHaveCount(0);

    await expect(page.locator("main#main")).toHaveCount(1);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });

  test("switches between units of several occupancies", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("multi"));
    await page.goto("/");
    await expect(page.getByTestId("header-unit")).toHaveText("ห้อง A-201");
    await page.getByTestId("unit-switcher").click();
    const sheet = page.getByRole("dialog", { name: "เลือกห้อง" });
    await expect(sheet).toBeVisible();
    await expectAxeClean(page);
    await sheet.getByRole("button", { name: /ห้อง B-105/ }).click();
    await expect(page.getByTestId("header-unit")).toHaveText("ห้อง B-105");
    await expect(page.getByTestId("unit-card")).toContainText("อาคาร B");
  });

  test("the language switcher re-renders in English and keeps the choice", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("english"));
    await page.goto("/");
    await page.getByTestId("settings-open").click();
    await expectAxeClean(page);
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hello, สมชาย ใจดี");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("a namespace not yet translated falls back to English (D-064): technician screens in Khmer", async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: "gp_locale", value: "km", url: baseURL! }]);
    await page.goto("/technician/sign-in");
    await expect(page.locator("html")).toHaveAttribute("lang", "km");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sign in for technicians");
  });

  test("an API failure shows the error with its request id, not a blank page", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("broken"));
    await forceProblems(context, baseURL!, { "resident.me.get": "internal.unexpected" });
    await page.goto("/");
    await expect(page.getByRole("alert").filter({ hasText: "เกิดข้อผิดพลาด" })).toContainText(
      /รหัสคำขอ: [0-9a-f-]{36}/,
    );
    await expect(page.getByRole("link", { name: "ลองอีกครั้ง" })).toBeVisible();
    await expectAxeClean(page);
  });

  test("an unknown path renders the not-found page inside the shell", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("notfound"));
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: "ไม่พบหน้านี้" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "เมนูด่วน" })).toBeVisible();
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);
  });
});

test.describe("security and platform", () => {
  test("every page carries a fresh CSP nonce, and every script uses it (no 'unsafe-inline')", async ({
    page,
    request,
  }) => {
    const first = await request.get("/auth");
    const second = await request.get("/auth");
    const csp = first.headers()["content-security-policy"] ?? "";
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src ")) ?? "";
    const nonce = /'nonce-([^']+)'/.exec(scriptSrc)?.[1];
    expect(nonce).toBeTruthy();
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(second.headers()["content-security-policy"]).not.toContain(nonce!);
    expect(first.headers()["x-robots-tag"]).toBe("noindex, nofollow");
    expect(first.headers()["permissions-policy"]).toContain("camera=(self)");

    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
    });
    await page.goto("/auth");
    const scripts = await page
      .locator("script")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({ nonce: (node as HTMLScriptElement).nonce, src: (node as HTMLScriptElement).src })),
      );
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(script.nonce, script.src).not.toBe("");
    // The page is interactive: hydration ran under the nonce.
    await page.getByLabel("เบอร์มือถือ").fill("12");
    await page.getByTestId("send-code").click();
    await expect(page.getByText("กรอกเบอร์มือถือ 10 หลัก")).toBeVisible();
    expect(violations).toEqual([]);
  });

  test("serves an installable manifest, the service worker and the offline page", async ({ request }) => {
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(["192x192", "512x512", "512x512"]);
    expect((await request.get(manifest.icons[0].src)).status()).toBe(200);
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(await sw.text()).toContain("gp-shell-v1");
    expect((await request.get("/offline.html")).status()).toBe(200);
  });

  test("Web Vitals go to the BFF's RUM endpoint, same-origin only", async ({ request, baseURL }) => {
    const ok = await request.post("/bff/rum", {
      data: { name: "LCP", value: 1200, route: "/", inClient: true, os: "android" },
      headers: { origin: baseURL!, "sec-fetch-site": "same-origin" },
    });
    expect(ok.status()).toBe(204);
    const cross = await request.post("/bff/rum", {
      data: {},
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    });
    expect(cross.status()).toBe(403);
  });
});
