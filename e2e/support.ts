import AxeBuilder from "@axe-core/playwright";
import { expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Shared e2e helpers. The app runs as a mock build: the fake LIFF (`gp_fake_liff` cookie configures it) and the
 * contract mocks (`mocks/`). Scenario words in the fake LINE subject pick the mock account (`mocks/state.ts`);
 * each test uses its own subject so parallel tests never share state.
 */
export const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export async function expectAxeClean(page: Page) {
  // A refresh in flight (router.refresh after a mutation) may stream the head again: wait for the title.
  await expect.poll(() => page.title()).not.toBe("");
  // A toast still fading in is read as low contrast (its colours are blended with the page): let it settle.
  await page
    .waitForFunction(
      () => [...document.querySelectorAll("[data-sonner-toast]")].every((el) => getComputedStyle(el).opacity === "1"),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
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
  /** `shareTargetPicker`: available (default inside LINE), unavailable, or the resident cancels. */
  share?: "available" | "unavailable" | "cancel";
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

/** What the browser fake LIFF would have opened or shared in LINE (`window.__gpFakeLiff`, mock builds only). */
export async function fakeLiffRecord(page: Page): Promise<{
  opened: { url: string; external?: boolean }[];
  shared: { type: string; text: string }[][];
}> {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __gpFakeLiff?: { opened: { url: string; external?: boolean }[]; shared: { type: string; text: string }[][] };
        }
      ).__gpFakeLiff ?? { opened: [], shared: [] },
  );
}

/**
 * Plays the payment provider's callback in the mock API (`POST /v1/resident/__mock/invoices/{id}/pay`, mocks only):
 * the invoice is paid, a receipt issued and the events go down the resident's realtime stream.
 */
export async function mockProviderPays(page: Page, invoiceId: string): Promise<void> {
  const origin = new URL(page.url()).origin;
  const response = await page.request.post(`/bff/v1/resident/__mock/invoices/${invoiceId}/pay`, {
    headers: { "x-getproperty-csrf": "1", origin },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/**
 * Plays the landlord's Owner confirming the phone match of the signed-in resident or technician (D-226) in the mock
 * API (`POST /v1/{resident,technician}/__mock/link-requests/confirm`, mocks only). The login hears
 * `party.link_changed` on its realtime stream (D-228).
 */
export async function mockOwnerConfirmsLink(page: Page, audience: "resident" | "technician" = "resident") {
  await mockOwnerDecidesLink(page, "confirm", audience);
}

/** The Owner's decision on the signed-in login's phone match (`…/__mock/link-requests/{confirm,reject}`, mocks only). */
export async function mockOwnerDecidesLink(
  page: Page,
  decision: "confirm" | "reject",
  audience: "resident" | "technician" = "resident",
) {
  const origin = new URL(page.url()).origin;
  const response = await page.request.post(`/bff/v1/${audience}/__mock/link-requests/${decision}`, {
    headers: { "x-getproperty-csrf": "1", origin },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

/**
 * Plays the Owner's decision on the QR transfers held for an invoice (D-220) in the mock API
 * (`POST /v1/resident/__mock/invoices/{id}/held`, mocks only): `dismiss` → `payment.dismissed`, `confirm` → booked.
 */
export async function mockOwnerDecidesHeld(page: Page, invoiceId: string, decision: "dismiss" | "confirm") {
  const origin = new URL(page.url()).origin;
  const response = await page.request.post(`/bff/v1/resident/__mock/invoices/${invoiceId}/held`, {
    headers: { "x-getproperty-csrf": "1", origin },
    data: { decision },
  });
  expect(response.status(), await response.text()).toBe(200);
}

/** A 1×1 PNG. */
export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/**
 * A "slip" the fake verifiers read (getproperty-api `FakeSlipVerifier`, the mock's copy of it): a PNG followed by
 * the JSON a real verifier would return.
 */
export function slipImage(
  fields: { transRef: string; amount: string; receiverAccount?: string },
  /** Total size in bytes (a real bank-app screenshot is 250 KB – 1.5 MB): padded after the image data. */
  size = 0,
): Buffer {
  const slip = slipBytes(fields);
  return size > slip.length ? Buffer.concat([slip, Buffer.alloc(size - slip.length, 0x20)]) : slip;
}

function slipBytes(fields: { transRef: string; amount: string; receiverAccount?: string }): Buffer {
  return Buffer.concat([
    PNG_1PX,
    Buffer.from(
      JSON.stringify({
        transRef: fields.transRef,
        amount: fields.amount,
        paidAt: new Date().toISOString(),
        receiverBankCode: "004",
        receiverAccount: fields.receiverAccount ?? "xxx-x-x1234-x",
        receiverName: "บริษัท หอพักตัวอย่าง จำกัด",
        senderName: "ผู้เช่า ทดสอบ",
      }),
    ),
  ]);
}

/**
 * The request thread loads when it comes near the screen (D-179, `LazyRequestThread`): bring it into view before
 * reading or writing it (assertions do not scroll by themselves).
 */
export async function showThread(page: Page) {
  const thread = page.getByTestId("request-thread");
  // The placeholder is replaced by the loaded thread (same test id), so a scroll may hit a detached node: retry.
  await expect(async () => {
    await thread.scrollIntoViewIfNeeded({ timeout: 2_000 });
    await expect(thread.getByTestId("thread-input").or(thread.getByTestId("thread-closed"))).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
}
