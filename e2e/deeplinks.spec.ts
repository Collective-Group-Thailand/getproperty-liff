import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { expectAxeClean, fakeLiff, seedSession, subject } from "./support";

/**
 * #28 (getproperty-api F6, D-218) — the LINE messages of the B5 notifications open the exact screen:
 * `service_request.changed` → `/requests/{id}`, `announcement.published` → `/announcements/{id}`, `parcel.received` →
 * `/parcels`, and `work_order.assigned` → `/technician/work-orders/{id}` for technicians. The API writes
 * `PUBLIC_RESIDENT_APP_URL<path>`: with the LIFF URL there LINE opens `/liff?liff.state=<path>` (sometimes
 * double-encoded); with the app's own URL the page is opened directly in LINE's browser and the guard sends a
 * signed-out reader through `/liff` first. Every link is followed both ways, signed out, and lands on its screen.
 */

/** A LINE in-app browser (the guard recognises ` Line/<version>`). */
const LINE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 Line/14.19.0";

interface Link {
  name: string;
  audience: "resident" | "technician";
  /** Reads the path of a real item of this account (signed in once, then signed out again). */
  path: (page: Page) => Promise<string>;
  /** What the landed screen shows. */
  landed: (page: Page) => Promise<void>;
}

const LINKS: Link[] = [
  {
    name: "service_request.changed → /requests/{id}",
    audience: "resident",
    path: async (page) => {
      await page.goto("/requests");
      return (await page.locator('[data-testid="request-item"][data-status="assigned"]').getAttribute("href"))!;
    },
    landed: async (page) => {
      await expect(page.getByTestId("request-detail")).toHaveAttribute("data-status", "assigned");
      await expect(page.getByTestId("request-visit")).toBeVisible();
    },
  },
  {
    name: "announcement.published → /announcements/{id}",
    audience: "resident",
    path: async (page) => {
      await page.goto("/announcements");
      return (await page.getByTestId("announcement-item").first().getAttribute("href"))!;
    },
    landed: async (page) => {
      await expect(page.getByTestId("announcement-detail").getByRole("heading", { level: 1 })).toHaveText(
        "งดจ่ายน้ำชั่วคราว วันเสาร์ 09:00–12:00 น.",
      );
    },
  },
  {
    name: "parcel.received → /parcels",
    audience: "resident",
    path: async () => "/parcels",
    landed: async (page) => {
      await expect(
        page.locator('[data-testid="parcel"][data-status="notified"]').getByTestId("parcel-pin-code"),
      ).toHaveText("482913");
    },
  },
  {
    name: "work_order.assigned → /technician/work-orders/{id}",
    audience: "technician",
    path: async (page) => {
      await page.goto("/technician");
      return (await page.locator('[data-testid="work-order-item"][data-status="assigned"]').getAttribute("href"))!;
    },
    landed: async (page) => {
      await expect(page.getByTestId("work-order")).toHaveAttribute("data-status", "assigned");
      await expect(page.getByTestId("work-order")).toContainText("ก๊อกน้ำอ่างล้างหน้ารั่ว");
    },
  },
];

/** Signs the account in once (resident: a seeded session; technician: LINE through `/liff`) to read a real path. */
async function realPath(browser: Browser, baseURL: string, link: Link, sub: string): Promise<string> {
  const context = await browser.newContext({ baseURL, viewport: { width: 360, height: 780 } });
  try {
    const page = await context.newPage();
    if (link.audience === "resident") {
      await seedSession(context, baseURL, sub);
    } else {
      await fakeLiff(context, baseURL, { sub });
      await page.goto("/liff?liff.state=%2Ftechnician");
      await expect(page).toHaveURL(/\/technician$/);
    }
    const path = await link.path(page);
    expect(path).toMatch(/^\/[a-z]/);
    return path;
  } finally {
    await context.close();
  }
}

async function signedOutInLine(browser: Browser, baseURL: string, sub: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL, viewport: { width: 360, height: 780 }, userAgent: LINE_UA });
  await fakeLiff(context, baseURL, { sub, inClient: true });
  return context;
}

test.describe("LINE deep links of the B5 notifications (#28, D-218)", () => {
  for (const link of LINKS) {
    test(link.name, async ({ browser, baseURL }) => {
      const sub = link.audience === "technician" ? subject("tech", "deeplink") : subject("deeplink");
      const path = await realPath(browser, baseURL!, link, sub);
      const exact = new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);

      // 1. The LIFF URL: LINE opens the endpoint with liff.state (plain, then double-encoded).
      for (const state of [encodeURIComponent(path), encodeURIComponent(encodeURIComponent(path))]) {
        const context = await signedOutInLine(browser, baseURL!, sub);
        const page = await context.newPage();
        await page.goto(`/liff?liff.state=${state}`);
        await expect(page).toHaveURL(exact);
        await link.landed(page);
        await context.close();
      }

      // 2. The app's own URL opened in LINE's browser, signed out: through /liff and back to the same screen.
      const context = await signedOutInLine(browser, baseURL!, sub);
      const page = await context.newPage();
      await page.goto(path);
      await expect(page).toHaveURL(exact);
      await link.landed(page);
      await expectAxeClean(page);
      await context.close();
    });
  }
});
