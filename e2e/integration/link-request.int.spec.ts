import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { API_PORT, intDatabase, ownerAccessToken, setLatestOtpCode } from "./harness";

/**
 * D-226 against the real getproperty-api (no mocks): an SMS-verified phone links nothing by itself. The office enters
 * a resident (with an occupancy) and an external technician (with a work order) by phone; each signs in with an SMS
 * code and is told the landlord's office must confirm first — no unit, bills or work orders; the Owner confirms the
 * link request through the owner API (`/v1/owner/party-link-requests/{id}/actions/confirm`, Idempotency-Key); the
 * resident's "check again" and the technician's "check for new work" then rotate the session and the unit / work
 * order is there (`linkedVia: admin`).
 */
const API = `http://127.0.0.1:${API_PORT}`;
const DEV_TENANT = "0199f2a0-0000-7000-8000-000000000001";
const CODE = "135791";
const RESIDENT_PHONE = "0810009911";
const TECHNICIAN_PHONE = "0810009922";

async function createParty(request: APIRequestContext, owner: string, displayName: string, phone: string) {
  const created = await request.post(`${API}/v1/owner/parties`, {
    headers: { authorization: `Bearer ${owner}` },
    data: { type: "person", displayName, phone: `+66${phone.slice(1)}` },
  });
  expect(created.status(), await created.text()).toBe(201);
  return ((await created.json()) as { id: string }).id;
}

/** The Owner confirms the one pending link request of `partyId`. */
async function confirmLink(request: APIRequestContext, owner: string, partyId: string) {
  const headers = { authorization: `Bearer ${owner}` };
  const listed = await request.get(`${API}/v1/owner/party-link-requests?state=pending&partyId=${partyId}`, {
    headers,
  });
  expect(listed.status(), await listed.text()).toBe(200);
  const pending = ((await listed.json()) as { data: { id: string; partyId: string; state: string }[] }).data;
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({ partyId, state: "pending" });
  const confirmed = await request.post(`${API}/v1/owner/party-link-requests/${pending[0]!.id}/actions/confirm`, {
    headers: { ...headers, "idempotency-key": randomUUID() },
  });
  expect(confirmed.status(), await confirmed.text()).toBe(200);
  expect(await confirmed.json()).toMatchObject({ state: "confirmed" });
}

async function residentSmsSignIn(page: Page, phone: string) {
  await page.goto("/auth?next=%2F");
  await page.getByLabel("เบอร์มือถือ").fill(phone);
  await page.getByTestId("send-code").click();
  await expect(page).toHaveURL(/\/auth\/otp\?c=/);
  await setLatestOtpCode("resident_login", CODE);
  await page.getByLabel("หลักที่ 1").pressSequentially(CODE);
  // A login without a tenant yet may be asked for the consents first (D-025).
  const home = page.getByTestId("resident-home");
  await expect(home.or(page.getByTestId("consent-submit"))).toBeVisible({ timeout: 30_000 });
  if (await page.getByTestId("consent-submit").isVisible()) {
    await page.locator('[data-purpose="resident.service"]').getByRole("checkbox").click();
    await page.getByTestId("consent-submit").click();
  }
  await expect(home).toBeVisible();
}

test("resident: SMS sign-in waits for the Owner; once confirmed, check again → the unit and its bills", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const owner = await ownerAccessToken(request);
  const partyId = await createParty(request, owner, "ผู้เช่า รอยืนยัน", RESIDENT_PHONE);
  const db = await intDatabase();
  let unitNo: string;
  let unitId: string;
  try {
    const unit = await db.query<{ id: string; unit_no: string; building_id: string }>(
      `SELECT u.id, u.unit_no, u.building_id FROM core.unit u
        WHERE u.tenant_id = $1 AND u.unit_no <> 'A-103'
          AND NOT EXISTS (SELECT 1 FROM core.occupancy o WHERE o.unit_id = u.id)
        ORDER BY u.unit_no LIMIT 1`,
      [DEV_TENANT],
    );
    unitNo = unit.rows[0]!.unit_no;
    unitId = unit.rows[0]!.id;
    await db.query(
      `INSERT INTO core.occupancy (tenant_id, building_id, unit_id, party_id, role, valid_from)
       VALUES ($1, $2, $3, $4, 'tenant', '2026-01-01')`,
      [DEV_TENANT, unit.rows[0]!.building_id, unitId, partyId],
    );
  } finally {
    await db.end();
  }

  await residentSmsSignIn(page, RESIDENT_PHONE);
  const pending = page.getByTestId("home-link-pending");
  await expect(pending).toContainText("รอผู้ดูแลอาคารยืนยัน");
  await expect(page.getByTestId("unit-card")).toHaveCount(0);
  const before = (await (await page.request.get("/bff/v1/resident/me")).json()) as {
    units: unknown[];
    linkRequestsPending: number;
    scopes: string[];
  };
  expect(before).toMatchObject({ units: [], linkRequestsPending: 1 });
  expect(before.scopes.filter((s) => s.startsWith("unit:"))).toEqual([]);

  // Not yet: "check again" still waits.
  await page.getByTestId("home-link-pending-check").click();
  await expect(pending).toBeVisible();

  await confirmLink(request, owner, partyId);
  await page.getByTestId("home-link-pending-check").click();
  await expect(page.getByTestId("header-unit")).toHaveText(`ห้อง ${unitNo}`, { timeout: 30_000 });
  await expect(pending).toHaveCount(0);
  const after = (await (await page.request.get("/bff/v1/resident/me")).json()) as {
    linkRequestsPending: number;
    scopes: string[];
  };
  expect(after.linkRequestsPending).toBe(0);
  // The session was rotated by `/auth/rescope`: the token carries the unit now.
  expect(after.scopes).toContain(`unit:${unitId}`);
  expect((await page.request.get("/bff/v1/resident/invoices")).status()).toBe(200);
});

test("technician: SMS sign-in shows no work order until the Owner confirms; check for new work → the job", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(150_000);
  const owner = await ownerAccessToken(request);
  const partyId = await createParty(request, owner, "ช่างไฟ รอยืนยัน", TECHNICIAN_PHONE);
  const db = await intDatabase();
  let unitId: string;
  try {
    const unit = await db.query<{ id: string }>(
      `SELECT u.id FROM core.unit u WHERE u.tenant_id = $1 ORDER BY u.unit_no LIMIT 1`,
      [DEV_TENANT],
    );
    unitId = unit.rows[0]!.id;
  } finally {
    await db.end();
  }
  const opened = await request.post(`${API}/v1/owner/work-orders`, {
    headers: { authorization: `Bearer ${owner}`, "idempotency-key": randomUUID() },
    data: {
      kind: "repair",
      title: "เปลี่ยนหลอดไฟทางเดิน (integration)",
      unitId,
      assigneePartyId: partyId,
      scheduledAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    },
  });
  expect(opened.status(), await opened.text()).toBe(201);

  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, baseURL });
  const page = await context.newPage();
  await page.goto("/technician");
  await expect(page).toHaveURL(/\/technician\/sign-in/);
  await page.getByLabel("เบอร์มือถือ").fill(TECHNICIAN_PHONE);
  await page.getByTestId("technician-send-code").click();
  const otp = page.getByTestId("technician-otp");
  await expect(otp).toBeVisible();
  await setLatestOtpCode("technician_login", CODE);
  await otp.getByRole("textbox").first().fill(CODE);
  await expect(page).toHaveURL(/\/technician$/, { timeout: 30_000 });
  await expect(page.getByTestId("work-order-item")).toHaveCount(0);
  await expect(page.getByTestId("technician-home")).toContainText("ผู้ดูแลอาคารต้องยืนยันว่าเป็นคุณก่อน");

  await confirmLink(request, owner, partyId);
  await page.getByTestId("technician-refresh").click();
  await expect(page.getByTestId("work-order-item")).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByTestId("work-order-item")).toContainText("เปลี่ยนหลอดไฟทางเดิน (integration)");
  await context.close();
});
