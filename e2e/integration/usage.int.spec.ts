import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { API_PORT, intDatabase, ownerAccessToken } from "./harness";

/**
 * L3 3.3 usage against the real getproperty-api (no mocks): the dev seed's lease on A-101 (active, signed on paper)
 * is linked to a LINE resident through an invitation; the unit's two meters get an installed IoT device (the
 * `usage` entitlement) and hourly / daily rollup rows; the usage screen asks the API for 1 h / 1 d buckets of the
 * current and the previous period and shows them in its charts and tables (D-063, D-162).
 *
 * api `74bdcdc` (T-14, D-241) computes **15-minute** series from raw points on read; hourly and daily series — the
 * only buckets this app requests — still come from the stored rollups (5 years). This spec pins that the resident
 * screen keeps working on that API.
 */
const API = `http://127.0.0.1:${API_PORT}`;
const DEV_TENANT = "0199f2a0-0000-7000-8000-000000000001";
const DEV_LEASE = "0199f2a0-0000-7000-8000-000000000006";
const RESIDENT_SUB = "U00000000000000000000000usage0001";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const BANGKOK = 7 * HOUR;

interface Meter {
  assetItemId: string;
  buildingId: string;
  utility: "electric" | "water";
}

/** Per bucket usage of the current / previous period (decimal strings, as the rollups store them). */
const USAGE = {
  "1d": { electric: ["4.250", "3.500"], water: ["0.180", "0.120"] },
  "1h": { electric: ["0.375", "0.250"], water: ["0.010", "0.005"] },
} as const;

test("a linked resident's usage charts read the hourly and daily series of the API", async ({
  page,
  context,
  baseURL,
  request,
}) => {
  test.setTimeout(180_000);
  const owner = await ownerAccessToken(request);

  // The unit's meters get an installed device (status online) and rollup rows for both periods of every range.
  const db = await intDatabase();
  try {
    const { rows: meters } = await db.query<Meter>(
      `SELECT m.asset_item_id AS "assetItemId", m.building_id AS "buildingId", m.utility::text AS utility
         FROM core.meter_assignment m JOIN core.unit u ON u.id = m.unit_id
        WHERE m.tenant_id = $1 AND u.unit_no = 'A-101' AND m.valid_to IS NULL
        ORDER BY m.utility`,
      [DEV_TENANT],
    );
    expect(meters.map((m) => m.utility).sort()).toEqual(["electric", "water"]);
    const now = Date.now();
    const midnight = Math.floor((now + BANGKOK) / DAY) * DAY - BANGKOK;
    const hour = Math.floor(now / HOUR) * HOUR;
    for (const meter of meters) {
      await db.query(
        `INSERT INTO smart.device (serial, kind, model, vendor, tenant_id, building_id, asset_item_id, status)
         VALUES ($1, $2::smart.device_kind, 'INT-1', 'integration', $3, $4, $5, 'online')`,
        [
          `INT-USAGE-${randomUUID()}`,
          meter.utility === "electric" ? "electric_meter" : "water_meter",
          DEV_TENANT,
          meter.buildingId,
          meter.assetItemId,
        ],
      );
      const rollups: [table: string, start: number, step: number, count: number, bucket: "1d" | "1h"][] = [
        ["smart.telemetry_1d", midnight - 6 * DAY, DAY, 7, "1d"],
        ["smart.telemetry_1h", hour - 23 * HOUR, HOUR, 24, "1h"],
      ];
      for (const [table, start, step, count, bucket] of rollups) {
        const [current, previous] = USAGE[bucket][meter.utility];
        for (let i = 0; i < count; i++) {
          for (const [at, usage] of [
            [start + i * step, current],
            [start - count * step + i * step, previous],
          ] as const) {
            await db.query(
              `INSERT INTO ${table} (asset_item_id, bucket, tenant_id, building_id, unit, first_time, last_time,
                 first_register, last_register, min_register, max_register, points, usage)
               VALUES ($1, $2, $3, $4, $5::smart.meter_unit, $2, $2, 100, 100 + $6::numeric, 100, 100 + $6::numeric, 4, $6)
               ON CONFLICT DO NOTHING`,
              [
                meter.assetItemId,
                new Date(at).toISOString(),
                DEV_TENANT,
                meter.buildingId,
                meter.utility === "electric" ? "kwh" : "m3",
                usage,
              ],
            );
          }
        }
      }
    }
  } finally {
    await db.end();
  }

  // The office invites the lessee of the dev lease; the resident links in the fake LIFF (consent first, D-025).
  const invitation = await request.post(`${API}/v1/owner/leases/${DEV_LEASE}/invitations`, {
    headers: { authorization: `Bearer ${owner}` },
    data: { channel: "line_qr" },
  });
  expect(invitation.status(), await invitation.text()).toBe(201);
  const code = ((await invitation.json()) as { code: string }).code;
  await context.addCookies([
    {
      name: "gp_fake_liff",
      value: encodeURIComponent(JSON.stringify({ sub: RESIDENT_SUB, name: "ผู้เช่า มิเตอร์" })),
      url: baseURL!,
    },
  ]);
  await page.goto(`/liff?liff.state=${encodeURIComponent(`/link?code=${code}`)}`);
  await expect(page).toHaveURL(/\/consent\?next=/, { timeout: 30_000 });
  await page.locator('[data-purpose="resident.service"]').getByRole("checkbox").click();
  await page.getByTestId("consent-submit").click();
  await expect(page).toHaveURL(/\/link\?code=/);
  await page.getByTestId("link-submit").click();
  await expect(page.getByTestId("link-success")).toBeVisible();
  await page.getByTestId("link-continue").click();

  // 7 days (default): one row per Bangkok day, the previous 7 days beside it, the API's totals and estimate.
  await page.goto("/usage");
  await expect(page.getByTestId("usage-range-7d")).toHaveAttribute("aria-current", "page");
  for (const utility of ["electric", "water"] as const) {
    await expect(page.getByTestId(`usage-chart-${utility}`)).toBeVisible();
    await expect(page.getByTestId(`usage-summary-${utility}`)).toBeVisible();
  }
  await page.getByTestId("usage-table-toggle-electric").click();
  const daily = page.getByTestId("usage-table-electric").locator("tbody tr");
  await expect(daily).toHaveCount(7);
  for (let i = 0; i < 7; i++) {
    await expect(daily.nth(i).getByRole("cell")).toHaveText(["4.25 kWh", "3.5 kWh"]);
  }
  await page.getByTestId("usage-table-toggle-water").click();
  await expect(page.getByTestId("usage-table-water").locator("tbody tr").first().getByRole("cell")).toHaveText([
    /^0\.18 /,
    /^0\.12 /,
  ]);

  // 24 hours: hourly buckets from the hourly rollup.
  await page.getByTestId("usage-range-24h").click();
  await expect(page.getByTestId("usage-range-24h")).toHaveAttribute("aria-current", "page");
  // The table toggle keeps its state across ranges (client navigation): open it only when it is closed.
  const toggle = page.getByTestId("usage-table-toggle-electric");
  if ((await toggle.getAttribute("aria-expanded")) === "false") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const hourly = page.getByTestId("usage-table-electric").locator("tbody tr");
  await expect(hourly).toHaveCount(24);
  await expect(hourly.first().getByRole("cell")).toHaveText(["0.375 kWh", "0.25 kWh"]);
  await expect(hourly.last().getByRole("cell")).toHaveText(["0.375 kWh", "0.25 kWh"]);

  // The API answers the same windows through the BFF (the resident's session), 1 h and 1 d only.
  const to = new Date().toISOString();
  const from = new Date(Date.now() - 2 * DAY).toISOString();
  for (const bucket of ["1h", "1d"]) {
    const res = await page.request.get(
      `/bff/v1/resident/leases/${DEV_LEASE}/usage?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&bucket=${bucket}`,
    );
    expect(res.status(), await res.text()).toBe(200);
    const body = (await res.json()) as { bucket: string; series: { utility: string; points: unknown[] }[] };
    expect(body.bucket).toBe(bucket);
    expect(body.series.map((s) => s.utility)).toEqual(["electric", "water"]);
    expect(body.series[0]!.points.length).toBeGreaterThan(0);
  }
});
