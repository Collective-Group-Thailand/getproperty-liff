import { expect, test, type BrowserContext } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, seedSession, subject } from "./support";

test.describe("an operator's own LINE OA (D-254)", () => {
  test("the OA's link: see who asks, link with one tap, the link is then used", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("oa"));
    const token = `mock-oa-valid-${Date.now().toString(36)}`;
    await page.goto(`/link/oa?t=${token}`);
    const view = page.getByTestId("oa-link");
    await expect(view.getByRole("heading", { level: 1 })).toHaveText("รับข้อความผ่าน LINE ของผู้ให้เช่า");
    await expect(page.getByTestId("oa-link-who")).toContainText("บัญชี LINE ทางการของ บ้านเช่าสมใจ");
    await expect(view.getByRole("list", { name: "สิ่งที่จะส่งมาที่บัญชีนี้" }).getByRole("listitem")).toHaveCount(3);
    await expectNoHorizontalScroll(page);
    await expectAxeClean(page);

    await page.getByTestId("oa-link-confirm").click();
    await expect(page.getByTestId("oa-link-done")).toContainText("ต่อจากนี้บิลและข้อความจะส่งมาที่ บ้านเช่าสมใจ");
    await expectAxeClean(page);

    await page.reload();
    await expect(page.getByTestId("oa-link-ended")).toHaveAttribute("data-state", "used");
    await page.goto(`/link/oa?t=${token}`);
    await expect(page.getByTestId("oa-link-ended")).toContainText("ลิงก์นี้ใช้ไปแล้ว");
  });

  test("expired, taken and unknown links say what to do", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("oa-ended"));
    await page.goto("/link/oa?t=mock-oa-expired-1");
    await expect(page.getByTestId("oa-link-ended")).toContainText("พิมพ์อะไรก็ได้ในแชทของ บ้านเช่าสมใจ");

    await page.goto("/link/oa?t=mock-oa-taken-1");
    await page.getByTestId("oa-link-confirm").click();
    await expect(page.getByTestId("oa-link-ended")).toHaveAttribute("data-state", "taken");
    await expectAxeClean(page);

    await page.goto("/link/oa?t=nothing-here");
    await expect(page.getByTestId("oa-link-invalid")).toContainText("ลิงก์นี้ใช้ไม่ได้");
  });

  test("signed in only as a prospect, an agency's OA link goes through the prospect endpoints (G4)", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedProspect(context, baseURL!, subject("prospect", "oa"));
    const token = `mock-oa-valid-${Date.now().toString(36)}`;
    const calls: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/bff/v1/")) calls.push(new URL(request.url()).pathname);
    });
    await page.goto(`/link/oa?t=${token}`);
    const view = page.getByTestId("oa-link");
    await expect(view).toHaveAttribute("data-audience", "prospect");
    await expect(view.getByRole("heading", { level: 1 })).toHaveText("รับข้อความผ่าน LINE ของนายหน้า");
    await expect(view.getByRole("list", { name: "สิ่งที่จะส่งมาที่บัญชีนี้" }).getByRole("listitem")).toHaveCount(2);
    await expectAxeClean(page);
    await page.getByTestId("oa-link-confirm").click();
    await expect(page.getByTestId("oa-link-done")).toContainText("ข้อความเรื่องที่คุณสอบถามจะส่งมาจาก บ้านเช่าสมใจ");
    expect(calls).toContain(`/bff/v1/prospect/messaging-links/${token}/actions/confirm`);
    expect(calls.some((path) => path.startsWith("/bff/v1/resident/"))).toBe(false);
    await page.getByTestId("oa-link-home").click();
    await expect(page).toHaveURL(/\/rent\/enquiries$/);
  });
});

/** Signed in as a prospect only (mock seed refresh token); the proxy renews it on `/link/oa` too. */
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
