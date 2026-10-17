import { expect, test } from "@playwright/test";

/**
 * Visual snapshots of the resident shell (Storybook `Patterns/Resident shell`), light theme, 360 × 780: the
 * header with unit + building or the wordmark, the settings button and the bottom nav from entitlements.
 */
const STORIES = ["signed-in", "several-units", "signed-out", "english", "with-environment-badge"];

for (const story of STORIES) {
  test(`resident shell — ${story}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=patterns-resident-shell--${story}&viewMode=story&globals=theme:light`);
    await page.locator("#storybook-root main#main").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`resident-shell-${story}.png`, { fullPage: false });
  });
}

test("resident shell — unit switcher sheet", async ({ page }) => {
  await page.goto("/iframe.html?id=patterns-resident-shell--several-units&viewMode=story&globals=theme:light");
  await page.getByRole("button", { name: /เปลี่ยนห้อง/ }).click();
  await page.getByRole("dialog").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("resident-shell-unit-sheet.png");
});
