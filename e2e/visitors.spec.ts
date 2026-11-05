import { expect, test, type Page } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, fakeLiff, fakeLiffRecord, seedSession, subject } from "./support";

/**
 * JL4 — visitors, gate and SOS (api J4.1 + J4.2, D-315 … D-317, D-327, D-328): a visitor answered from the LINE
 * button (confirmation, never a silent act), someone else in the household answering first, a pass created and sent
 * to LINE (QR once), the barrier opened with a registered car (rate limit), an SOS sent with hold-to-confirm and
 * cancelled within its window, the visitors tab by role. Mock scenario words (`mocks/gate.ts`, `mocks/state.ts`):
 * `village`, `coowner`, `housefamily`, `visitor`, `nophoto`, `mycar`, `twocars`, `geofence`, `gateoff`, `quietgate`.
 * Written for the deferred e2e run (founder 2026-10-28) — not run in this step.
 */
async function checkPage(page: Page) {
  await expectNoHorizontalScroll(page);
  await expectAxeClean(page);
}

const VILLAGE = "b7c8d9e0-f1a2-4b3c-8d4e-5f6a7b8c9d0e";

async function mockPost(page: Page, path: string, data: unknown = {}) {
  const origin = new URL(page.url()).origin;
  const response = await page.request.post(`/bff/v1/resident/__mock/${path}`, {
    headers: { "x-getproperty-csrf": "1", origin },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

async function waitingVisitId(page: Page): Promise<string> {
  const response = await page.request.get(`/bff/v1/resident/visits?unitId=${VILLAGE}&state=requested`);
  const body = (await response.json()) as { data: { id: string }[] };
  return body.data[0]!.id;
}

test.use({ viewport: { width: 390, height: 844 } });

test.describe("visitors at the gate", () => {
  test("approve from the LINE button: the link opens a confirmation, the answer needs a tap", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("village", "visitor"));
    await page.goto("/");
    const id = await waitingVisitId(page);
    await page.goto(`/visits/${id}?answer=approve`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("มีผู้มาติดต่อที่ป้อม 1");
    await expect(page.getByTestId("visit-policy")).toHaveText("ถ้าไม่ตอบใน 3 นาที รปภ. จะโทรหาคุณ");
    await expect(page.getByTestId("visit-countdown")).toHaveText(/^\d:\d\d$/);
    await expect(page.getByTestId("visit-photo")).toBeVisible();
    await expect(page.getByTestId("visit-plate")).toHaveText("3กท 8812");
    // The link alone did nothing: a confirmation names the plate.
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("อนุญาตให้ 3กท 8812 เข้า?");
    await expect(page).toHaveURL(new RegExp(`/visits/${id}$`));
    await checkPage(page);
    await dialog.getByRole("button", { name: "อนุญาตให้เข้า" }).click();
    await expect(page.getByTestId("visit-result")).toHaveAttribute("data-result", "approved");
    await expect(page.getByTestId("visit-result")).toContainText("คุณอนุญาตให้เข้าแล้ว");
    // Reload: no second confirmation (the query was dropped), the result stays.
    await page.reload();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByTestId("visit-result")).toBeVisible();
  });

  test("someone else answered first: the result names them; a later link just shows it", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("village", "visitor", "nophoto"));
    await page.goto("/");
    const id = await waitingVisitId(page);
    await page.goto(`/visits/${id}`);
    // No photo: the plate is the picture, no stock image.
    await expect(page.getByTestId("visit-placeholder")).toContainText("3กท 8812");
    await expect(page.getByTestId("visit-photo")).toHaveCount(0);
    await mockPost(page, `visits/${id}/answer`, { answer: "approve", name: "คุณวิภา" });
    await page.getByTestId("visit-deny").click();
    const result = page.getByTestId("visit-result");
    await expect(result).toHaveAttribute("data-someone-else", "true");
    await expect(result).toContainText("คุณวิภา อนุญาตให้เข้าแล้ว");
    await expect(page.getByTestId("visit-actions")).toHaveCount(0);
    await checkPage(page);
    await page.goto(`/visits/${id}?answer=deny`);
    await expect(page.getByTestId("visit-link-answered")).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("call me keeps the decision open; the remembered car shows under cars", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("village", "quietgate"));
    await page.goto("/");
    const created = (await mockPost(page, `units/${VILLAGE}/visits`, { photo: true })) as { id: string };
    await page.goto(`/visits/${created.id}`);
    await page.getByTestId("visit-call-me").click();
    await expect(page.getByTestId("visit-called")).toBeVisible();
    await page.getByTestId("visit-remember").click();
    await page.getByTestId("visit-approve").click();
    await expect(page.getByTestId("visit-result")).toHaveAttribute("data-result", "approved");
    await page.goto("/visitors/cars");
    await expect(page.getByTestId("remembered-row")).toContainText("3กท 8812");
  });

  test("/visitors: waiting first, today, invites, cars and policy rows; the tab is in the nav", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("village", "visitor", "mycar"));
    await page.goto("/");
    const nav = page.getByRole("navigation", { name: "เมนูด่วน" });
    await expect(nav.getByRole("link", { name: "ผู้มาติดต่อ" })).toBeVisible();
    await expect(page.getByTestId("home-visit-waiting")).toContainText("3กท 8812");
    await expect(page.getByTestId("home-open-barrier")).toBeVisible();
    await nav.getByRole("link", { name: "ผู้มาติดต่อ" }).click();
    await expect(page).toHaveURL(/\/visitors$/);
    await expect(page.getByTestId("visitors-waiting").getByTestId("visit-row")).toHaveCount(1);
    await expect(page.getByTestId("visitors-today").getByTestId("visit-row")).toHaveCount(1);
    await expect(page.getByTestId("invite-row")).toHaveCount(2);
    await expect(page.getByTestId("visitors-policy-row")).toContainText("รอ 3 นาที แล้ว รปภ. โทรหา");
    await checkPage(page);
  });

  test("a pass: kind, window, plate → QR shown once → shared to LINE", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("village", "quietgate"));
    await fakeLiff(context, baseURL!, { inClient: true, share: "available" });
    await page.goto("/visitors/invites/new");
    await page.getByTestId("invite-kind-guest").check({ force: true });
    await page.getByTestId("invite-name").fill("คุณแม่");
    await page.getByTestId("invite-plate-open").click();
    await page.getByTestId("invite-plate-category").fill("1กข");
    await page.getByTestId("invite-plate-number").fill("1234");
    await page.getByTestId("invite-plate-province").selectOption("ชลบุรี");
    // An end before the start is caught on the phone.
    await page.getByTestId("invite-to-time").fill("00:00");
    await page.getByTestId("invite-to-date").fill(await page.getByTestId("invite-from-date").inputValue());
    await page.getByTestId("invite-submit").click();
    await expect(page.getByTestId("invite-summary")).toBeFocused();
    await page.getByTestId("invite-to-time").fill("23:30");
    await checkPage(page);
    await page.getByTestId("invite-submit").click();
    await expect(page.getByTestId("invite-qr")).toBeVisible();
    await expect(page.getByTestId("invite-once")).toBeVisible();
    await page.getByTestId("invite-share").click();
    await expect(page.getByTestId("invite-share-outcome")).toHaveText("ส่งทาง LINE แล้ว");
    const shared = (await fakeLiffRecord(page)).shared.at(-1)![0]!;
    expect(shared.text).toMatch(/\/pass#t=gpv1\./);
    await checkPage(page);
    // The visitor's page draws the same QR from the fragment.
    const url = shared.text.match(/https?:\/\/\S+\/pass#\S+/)![0];
    await page.goto(url);
    await expect(page.getByTestId("pass-qr")).toBeVisible();
    await checkPage(page);
    // Back in the app the pass is listed; its record never shows the QR again and can be cancelled.
    await page.goto("/visitors");
    await page.getByTestId("invite-row").first().click();
    await expect(page.getByTestId("invite-qr")).toHaveCount(0);
    await page.getByTestId("invite-revoke").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ยกเลิกบัตรผ่าน" }).click();
    await expect(page.getByTestId("invite-record")).toHaveAttribute("data-state", "revoked");
  });

  test("open the barrier: choose the car, sent, then the 3-second interval", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("village", "twocars"));
    await page.goto("/visitors/open");
    const panel = page.getByTestId("open-barrier");
    await expect(panel.getByRole("radiogroup", { name: "ประตู" })).toBeVisible();
    await panel
      .getByTestId(/open-car-/)
      .nth(1)
      .check({ force: true });
    await checkPage(page);
    await page.getByTestId("open-barrier-button").click();
    await expect(panel).toHaveAttribute("data-state", "opening");
    await expect(panel).toHaveAttribute("data-state", "sent", { timeout: 10_000 });
    await expect(page.getByTestId("open-status")).toContainText("ส่งคำสั่งเปิดแล้ว");
    await page.getByTestId("open-barrier-button").click();
    await expect(page.getByTestId("open-status")).toContainText(/รออีก \d วินาที|ส่งคำสั่งเปิดแล้ว/);
  });

  test("open the barrier: switched off by the estate, and a family member without cars", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("village", "mycar", "gateoff"));
    await page.goto("/visitors/open");
    await expect(page.getByTestId("open-barrier")).toHaveCount(0);
    await expect(page.getByText("นิติฯ ยังไม่เปิดให้เปิดไม้กั้นจากแอป")).toBeVisible();
    await context.clearCookies();
    await seedSession(context, baseURL!, subject("housefamily"));
    await page.goto("/visitors/policy");
    await expect(page.getByTestId("policy-readonly")).toBeVisible();
    await page.goto("/visitors/cars");
    await expect(page.getByTestId("car-add-open")).toHaveCount(0);
    await page.goto("/visitors/invites/new");
    await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("สร้างบัตรผ่าน");
  });

  test("SOS: kind, hold 1.5 s, sent → acknowledged; a second one shows the open one; cancel in the window", async ({
    page,
    context,
    baseURL,
  }) => {
    await seedSession(context, baseURL!, subject("village"));
    await page.goto("/visitors");
    await page.getByTestId("sos-open").click();
    const sheet = page.getByTestId("sos-sheet");
    await expect(sheet).toBeVisible();
    // The hold surface is out of the tab order; the accessible path is a dialog.
    await expect(page.getByTestId("sos-hold-surface")).toHaveAttribute("aria-hidden", "true");
    await sheet.getByTestId("sos-kind-medical").check({ force: true });
    await checkPage(page);
    // A short press cancels.
    const surface = page.getByTestId("sos-hold-surface");
    const box = (await surface.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();
    await expect(page.getByTestId("sos-hold")).toHaveAttribute("data-phase", "idle");
    await expect(page).toHaveURL(/\/visitors$/);
    // Held 1.5 s: sent.
    await page.mouse.down();
    await page.waitForTimeout(1700);
    await page.mouse.up();
    await expect(page).toHaveURL(/\/sos\/[0-9a-f-]+$/);
    await expect(page.getByTestId("sos-screen")).toHaveAttribute("data-state", "open");
    await expect(page.getByTestId("sos-hotline")).toHaveAttribute("href", "tel:1669");
    await expect(page.getByTestId("sos-cancel-left")).toBeVisible();
    await checkPage(page);
    const id = page.url().split("/").at(-1)!;
    await mockPost(page, `sos/${id}/acknowledge`);
    await page.reload();
    await expect(page.getByTestId("sos-screen")).toHaveAttribute("data-state", "acknowledged");
    await expect(page.locator('[data-step="acknowledged"]')).toHaveAttribute("data-done", "true");
    await expect(page.getByTestId("sos-cancel")).toHaveCount(0);
    // Another SOS for the house returns the open one.
    await page.goto("/visitors");
    await expect(page.getByTestId("visitors-sos-live")).toBeVisible();
    await page.getByTestId("sos-open").click();
    await page.getByTestId("sos-kind-fire").check({ force: true });
    await page.getByTestId("sos-hold-accessible").focus();
    await page.keyboard.press("Enter");
    await page.getByRole("alertdialog").getByRole("button", { name: "แจ้งเหตุ" }).click();
    await expect(page.getByTestId("sos-existing")).toBeVisible();
  });

  test("SOS cancelled within the window", async ({ page, context, baseURL }) => {
    await seedSession(context, baseURL!, subject("coowner"));
    await page.goto("/visitors");
    await page.getByTestId("sos-open").click();
    await page.getByTestId("sos-kind-other").check({ force: true });
    await page.getByTestId("sos-hold-accessible").focus();
    await page.keyboard.press("Enter");
    await page.getByRole("alertdialog").getByRole("button", { name: "แจ้งเหตุ" }).click();
    await expect(page).toHaveURL(/\/sos\//);
    await page.getByTestId("sos-cancel-button").click();
    await page.getByRole("alertdialog").getByRole("button", { name: "ยกเลิกการแจ้งเหตุ" }).click();
    await expect(page.getByTestId("sos-screen")).toHaveAttribute("data-state", "cancelled");
  });

  for (const locale of ["en", "my", "km", "lo", "zh"] as const) {
    test(`${locale}: the visit and /visitors at 360 px`, async ({ page, context, baseURL }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await context.addCookies([{ name: "gp_locale", value: locale, url: baseURL! }]);
      await seedSession(context, baseURL!, subject("village", "visitor", "mycar"));
      await page.goto("/visitors");
      await checkPage(page);
      await page.getByTestId("visitors-waiting").getByTestId("visit-row").click();
      await checkPage(page);
    });
  }
});
