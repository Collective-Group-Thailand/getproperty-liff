import { expect, test } from "@playwright/test";

/**
 * Visual snapshots of the resident shell (Storybook `Patterns/Resident shell`), light theme, 360 × 780: the
 * header with the house + unit and building or the founder's logo, the settings button and the bottom nav from
 * entitlements; the entry screens' logo above the content, in light and (`entry-dark`) dark.
 */
const STORIES = ["signed-in", "several-units", "signed-out", "english", "with-environment-badge", "entry"];

for (const story of STORIES) {
  test(`resident shell — ${story}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=patterns-resident-shell--${story}&viewMode=story&globals=theme:light`);
    await page.locator("#storybook-root main#main").waitFor();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`resident-shell-${story}.png`, { fullPage: false });
  });
}

test("resident shell — entry, dark theme", async ({ page }) => {
  await page.goto("/iframe.html?id=patterns-resident-shell--entry-dark&viewMode=story&globals=theme:dark");
  await page.locator("#storybook-root main#main").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("resident-shell-entry-dark.png", { fullPage: false });
});

test("resident shell — unit switcher sheet", async ({ page }) => {
  await page.goto("/iframe.html?id=patterns-resident-shell--several-units&viewMode=story&globals=theme:light");
  await page.getByRole("button", { name: /เปลี่ยนห้อง/ }).click();
  await page.getByRole("dialog").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot("resident-shell-unit-sheet.png");
});
