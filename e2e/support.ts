import AxeBuilder from "@axe-core/playwright";
import { expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Shared e2e helpers. The app runs as a mock build: the fake LIFF (`gp_fake_liff` cookie configures it) and the
 * contract mocks (`mocks/`). Scenario words in the fake LINE subject pick the mock account (`mocks/state.ts`);
 * each test uses its own subject so parallel tests never share state.
 */
export const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function expectAxeClean(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

let counter = 0;
/** A LINE subject unique to this test run, carrying the mock scenario words. */
export function subject(...words: string[]): string {
  counter += 1;
  return `U${["e2e", ...words].join("-")}-${process.pid}-${Date.now().toString(36)}-${counter}`;
}

export interface FakeLiffSetup {
  sub?: string;
  name?: string;
  loggedIn?: boolean;
  inClient?: boolean;
  language?: string;
  os?: "ios" | "android" | "web";
}

/** Configures the browser's fake LIFF (mock builds read `gp_fake_liff`). */
export async function fakeLiff(context: BrowserContext, baseURL: string, setup: FakeLiffSetup) {
  await context.addCookies([{ name: "gp_fake_liff", value: encodeURIComponent(JSON.stringify(setup)), url: baseURL }]);
}

/** Starts signed in without the LIFF flow: a mock "seed" refresh token the proxy turns into a session. */
export async function seedSession(context: BrowserContext, baseURL: string, sub: string) {
  await context.addCookies([
    // `__Host-`: host-only (a domain without a leading dot), `Path=/`, `Secure` (localhost counts as secure).
    {
      name: "__Host-gp_rt",
      value: `mock-rt.seed.${sub}`,
      domain: new URL(baseURL).hostname,
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/** Forces documented problems in the mock API: `{ "resident.me.get": "internal.unexpected" }`. */
export async function forceProblems(context: BrowserContext, baseURL: string, problems: Record<string, string>) {
  const value = Object.entries(problems)
    .map(([op, code]) => `${op}=${code}`)
    .join(";");
  await context.addCookies([{ name: "gp_mock", value: encodeURIComponent(value), url: baseURL }]);
}

export async function sessionCookieNames(context: BrowserContext): Promise<string[]> {
  return (await context.cookies())
    .filter((c) => c.name.startsWith("__Host-gp_"))
    .map((c) => c.name)
    .sort();
}
