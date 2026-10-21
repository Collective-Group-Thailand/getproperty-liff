import { expect, test } from "@playwright/test";

import { RESIDENT_LINE_SUB } from "./harness";

/**
 * Against the real getproperty-api (no mocks): the fake LIFF's id token is exchanged through this app's BFF at
 * `/v1/auth/resident/line` (fake LINE verifier), the API links the seeded party (D-061 line_match), the resident
 * gives the required consent through `/v1/resident/consents` and lands on the home driven by `/v1/resident/me`.
 */
test("fake LIFF token → resident session → consent → home on the real API", async ({ page, context, baseURL }) => {
  await context.addCookies([
    {
      name: "gp_fake_liff",
      value: encodeURIComponent(JSON.stringify({ sub: RESIDENT_LINE_SUB, name: "ผู้เช่า ทดสอบ" })),
      url: baseURL!,
    },
  ]);
  await page.goto("/liff");

  // First use: the API reports consentComplete=false (D-025), so the consent screen comes first.
  await expect(page).toHaveURL(/\/consent$/, { timeout: 30_000 });
  const required = page.locator('[data-purpose="resident.service"]');
  await expect(required).toBeVisible();
  await required.getByRole("checkbox").click();
  await page.getByTestId("consent-submit").click();

  const home = page.getByTestId("resident-home");
  await expect(home).toBeVisible();
  await expect(home.getByRole("heading", { level: 1 })).toContainText("ผู้เช่า ทดสอบ");
  // The occupancy the harness created: the header shows a unit of the dev building.
  await expect(page.getByTestId("header-unit")).toHaveText(/^ห้อง /);
  await expect(page.getByTestId("unit-card")).toBeVisible();

  const cookies = (await context.cookies()).filter((c) => c.name.startsWith("__Host-gp_")).map((c) => c.name);
  // The session pair, plus the realtime bridge's 60-s stream-token cookie once it authorised its stream (review L5).
  expect(cookies.filter((name) => name !== "__Host-gp_sst").sort()).toEqual(["__Host-gp_at", "__Host-gp_rt"]);

  // The BFF reaches the real resident surface with the cookie session.
  const me = await page.request.get("/bff/v1/resident/me");
  expect(me.status()).toBe(200);
  expect(await me.json()).toMatchObject({ consentComplete: true, user: { lineLinked: true } });
  // …and refuses everything outside it.
  expect((await page.request.get("/bff/v1/owner/me")).status()).toBe(404);
});
