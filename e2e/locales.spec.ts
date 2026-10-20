import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { expectAxeClean, expectNoHorizontalScroll, PNG_1PX, seedSession, subject } from "./support";

/**
 * L4 4.3 (D-064) — the home screen and the service-request flow in all six locales at 360 × 780: the page is in that
 * language (`lang`, the copy of `src/i18n/messages/<locale>`), axe-clean, without sideways scrolling for the longest
 * strings, and the script's own font is what draws it (no tofu: the face of my/km/lo/zh is loaded).
 */
const LOCALES = ["th", "en", "my", "km", "lo", "zh"] as const;
type Locale = (typeof LOCALES)[number];

const FAMILY: Partial<Record<Locale, string>> = {
  my: "GP Noto Sans Myanmar",
  km: "GP Noto Sans Khmer",
  lo: "GP Noto Sans Lao",
  zh: "GP Noto Sans SC",
};

function messages(locale: Locale, file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(__dirname, "../src/i18n/messages", locale, `${file}.json`), "utf8")) as Record<
    string,
    unknown
  >;
}
const text = (locale: Locale, file: string, path: string) =>
  path
    .split(".")
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], messages(locale, file)) as string;

async function useLocale(context: BrowserContext, baseURL: string, locale: Locale) {
  await context.addCookies([{ name: "gp_locale", value: locale, url: baseURL }]);
}

async function expectScriptFont(page: Page, locale: Locale) {
  const family = FAMILY[locale];
  if (!family) return;
  const loaded = await page.evaluate(async (name) => {
    await document.fonts.ready;
    return [...document.fonts].filter((face) => face.family.replace(/"/g, "") === name && face.status === "loaded")
      .length;
  }, family);
  expect(loaded, `${family} faces loaded`).toBeGreaterThan(0);
}

for (const locale of LOCALES) {
  test.describe(`${locale}`, () => {
    test(`home and a repair request in ${locale}`, async ({ page, context, baseURL }) => {
      await useLocale(context, baseURL!, locale);
      await seedSession(context, baseURL!, subject("locale", locale, "norequests"));

      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      const greeting = text(locale, "resident/home", "greeting").replace("{name}", "");
      await expect(page.getByTestId("resident-home").getByRole("heading", { level: 1 })).toContainText(greeting.trim());
      await expect(
        page
          .getByTestId("resident-home")
          .getByRole("link", { name: text(locale, "resident/home", "tiles.serviceRequest"), exact: true }),
      ).toBeVisible();
      await expectScriptFont(page, locale);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);

      await page.goto("/requests/new");
      const form = page.getByTestId("request-form");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(text(locale, "resident/requests", "new.title"));
      await form.getByTestId("request-submit").click();
      await expect(form.getByText(text(locale, "resident/requests", "new.categoryMissing"))).toBeVisible();
      await form.getByTestId("request-category").selectOption({ index: 2 });
      await form.getByRole("radio", { name: text(locale, "resident/requests", "new.priority.urgent") }).click();
      await form.getByTestId("request-description").fill("Water leaks under the sink / น้ำรั่ว");
      await form.getByTestId("request-photos-add").click();
      await form
        .locator('input[type="file"]')
        .setInputFiles([{ name: "leak.png", mimeType: "image/png", buffer: PNG_1PX }]);
      await form.getByTestId("camera-done").click();
      await expect(form.getByTestId("request-photos-list").getByRole("listitem")).toHaveCount(1);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
      await form.getByTestId("request-submit").click();

      await expect(page.getByTestId("request-detail")).toHaveAttribute("data-status", "new");
      await expect(page.getByTestId("request-timeline")).toContainText(
        text(locale, "resident/requests", "detail.event.new"),
      );
      await expectScriptFont(page, locale);
      await expectNoHorizontalScroll(page);
      await expectAxeClean(page);
    });
  });
}
