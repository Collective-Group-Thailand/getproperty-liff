import { expect, test } from "@playwright/test";

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
});
