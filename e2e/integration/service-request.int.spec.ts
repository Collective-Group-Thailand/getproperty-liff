import { randomUUID } from "node:crypto";

import { expect, test, type Locator } from "@playwright/test";

import { showThread } from "../support";
import { API_PORT, intDatabase, ownerAccessToken } from "./harness";

/**
 * L4 against the real getproperty-api (B5, no mocks): a resident files a service request with a photo from the LIFF
 * (presigned upload → the harness's object store → the API completes it), the office opens a work order on it and
 * assigns it to an external technician through the owner API, the technician signs in with LINE on the technician
 * app (`/v1/auth/technician/line`, the party's LINE id → `work_order:<id>` scope), accepts, checks in, sends an after
 * photo and completes; the resident sees the request done and rates it, which closes it (D-072). Since api 18b160e
 * (D-218) the loop also carries the preferred visit (structured, not in the description), the resident's visit
 * confirmation, the request's photos and status history, and the one thread shared by resident, office and
 * technician (`/messages` on each surface).
 *
 * The resident and the technician are parties of their own (LINE users no other spec uses); the resident occupies a
 * free dev unit. `module.service_requests` is on for the dev tenant (harness).
 */
const API = `http://127.0.0.1:${API_PORT}`;
const DEV_TENANT = "0199f2a0-0000-7000-8000-000000000001";
const RESIDENT_SUB = "U0000000000000000000000l4resident01";
const TECHNICIAN_SUB = "U0000000000000000000000l4technician";
/** A 1 × 1 PNG; the app re-encodes it before upload. */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

function fakeLiffCookie(baseURL: string, sub: string, name: string) {
  return {
    name: "gp_fake_liff",
    value: encodeURIComponent(JSON.stringify({ sub, name })),
    url: baseURL,
  };
}

async function addPhoto(scope: Locator, addId: string, file: string) {
  await scope.getByTestId(addId).click();
  await scope.locator('input[type="file"]').setInputFiles([{ name: file, mimeType: "image/png", buffer: PNG }]);
  await scope.getByTestId("camera-done").click();
}

test("resident files a request with a photo → office assigns → technician completes with photos → resident rates", async ({
  browser,
  baseURL,
  request,
}) => {
  test.setTimeout(240_000);

  // The resident (a free dev unit) and the external technician the office knows by LINE id.
  const db = await intDatabase();
  let technicianPartyId: string;
  try {
    const unit = await db.query<{ id: string; building_id: string }>(
      `SELECT u.id, u.building_id FROM core.unit u
        WHERE u.tenant_id = $1 AND u.unit_no <> 'A-103'
          AND NOT EXISTS (SELECT 1 FROM core.occupancy o WHERE o.unit_id = u.id)
        ORDER BY u.unit_no DESC LIMIT 1`,
      [DEV_TENANT],
    );
    const resident = await db.query<{ id: string }>(
      `INSERT INTO core.party (tenant_id, type, display_name, line_user_id, language)
       VALUES ($1, 'person', 'ผู้เช่า แจ้งซ่อม', $2, 'th') RETURNING id`,
      [DEV_TENANT, RESIDENT_SUB],
    );
    await db.query(
      `INSERT INTO core.occupancy (tenant_id, building_id, unit_id, party_id, role, valid_from)
       VALUES ($1, $2, $3, $4, 'tenant', '2026-01-01')`,
      [DEV_TENANT, unit.rows[0]!.building_id, unit.rows[0]!.id, resident.rows[0]!.id],
    );
    const technician = await db.query<{ id: string }>(
      `INSERT INTO core.party (tenant_id, type, display_name, line_user_id, language)
       VALUES ($1, 'person', 'ช่างประปา ทดสอบ', $2, 'th') RETURNING id`,
      [DEV_TENANT, TECHNICIAN_SUB],
    );
    technicianPartyId = technician.rows[0]!.id;
  } finally {
    await db.end();
  }

  const residentContext = await browser.newContext({ viewport: { width: 360, height: 780 }, baseURL });
  const technicianContext = await browser.newContext({ viewport: { width: 360, height: 780 }, baseURL });
  const resident = await residentContext.newPage();
  const technician = await technicianContext.newPage();

  // 1. The resident: LINE sign-in (line_match), consent, then the new-request form from the home tile.
  await residentContext.addCookies([fakeLiffCookie(baseURL!, RESIDENT_SUB, "ผู้เช่า แจ้งซ่อม")]);
  await resident.goto(`/liff?liff.state=${encodeURIComponent("/requests/new")}`);
  await expect(resident).toHaveURL(/\/consent\?next=/, { timeout: 30_000 });
  await resident.locator('[data-purpose="resident.service"]').getByRole("checkbox").click();
  await resident.getByTestId("consent-submit").click();
  await expect(resident).toHaveURL(/\/requests\/new$/);

  const form = resident.getByTestId("request-form");
  await form.getByTestId("request-category").selectOption({ index: 1 });
  await form.getByTestId("request-description").fill("น้ำรั่วใต้อ่างล้างจาน (integration)");
  await addPhoto(form, "request-photos-add", "leak.png");
  await expect(form.getByTestId("request-photos-list").getByRole("listitem")).toHaveCount(1);
  await form.getByTestId("request-visit").selectOption("morning");
  await form.getByTestId("request-submit").click();
  await expect(resident).toHaveURL(/\/requests\/[0-9a-f-]+\?sent=1$/, { timeout: 30_000 });
  const requestId = /\/requests\/([0-9a-f-]+)/.exec(resident.url())![1]!;
  await expect(resident.getByTestId("request-detail")).toHaveAttribute("data-status", "new");

  // 2. The office (owner API): the request has the resident's photo; a work order assigned to the technician.
  const owner = await ownerAccessToken(request);
  const headers = { authorization: `Bearer ${owner}` };
  const seen = await request.get(`${API}/v1/owner/service-requests/${requestId}`, { headers });
  expect(seen.status(), await seen.text()).toBe(200);
  const seenBody = (await seen.json()) as { photoIds: string[]; preferredVisit: string | null; description: string };
  expect(seenBody.photoIds, "the uploaded photo is attached").toHaveLength(1);
  expect(seenBody.preferredVisit, "the preferred visit is the API's field (D-218)").toBe("morning");
  expect(seenBody.description).toBe("น้ำรั่วใต้อ่างล้างจาน (integration)");
  // The resident's page: the photo (a link, or "being checked" until scanned clean) and the history so far.
  await expect(resident.getByTestId("request-photos").getByRole("listitem")).toHaveCount(1);
  await expect(resident.getByTestId("request-detail")).toContainText("ช่วงเช้า");
  const opened = await request.post(`${API}/v1/owner/service-requests/${requestId}/work-orders`, {
    headers: { ...headers, "idempotency-key": randomUUID() },
    data: {
      kind: "repair",
      title: "ซ่อมท่อน้ำใต้อ่าง",
      assigneePartyId: technicianPartyId,
      scheduledAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
    },
  });
  expect(opened.status(), await opened.text()).toBe(201);
  const workOrderId = ((await opened.json()) as { id: string }).id;
  await resident.reload();
  await expect(resident.getByTestId("request-detail")).toHaveAttribute("data-status", "assigned");

  // 2b. The resident confirms the planned visit (`confirm-visit`, D-218) and writes to the office on the thread;
  //     the office answers through the owner API.
  await resident.getByTestId("request-confirm-visit").click();
  await expect(resident.getByTestId("request-visit-confirmed")).toBeVisible({ timeout: 30_000 });
  const confirmed = await request.get(`${API}/v1/owner/service-requests/${requestId}`, { headers });
  expect(((await confirmed.json()) as { visitConfirmedAt: string | null }).visitConfirmedAt).not.toBeNull();
  await showThread(resident);
  await resident.getByTestId("thread-input").fill("อยู่ห้องทั้งเช้าค่ะ (integration)");
  await resident.getByTestId("thread-send").click();
  await expect(resident.getByTestId("thread-messages").locator('li[data-author="resident"]')).toHaveCount(1);
  const officeThread = await request.get(`${API}/v1/owner/service-requests/${requestId}/messages`, { headers });
  expect(officeThread.status(), await officeThread.text()).toBe(200);
  expect(((await officeThread.json()) as { data: { author: string; body: string }[] }).data).toEqual([
    expect.objectContaining({ author: "resident", body: "อยู่ห้องทั้งเช้าค่ะ (integration)" }),
  ]);
  const officeReply = await request.post(`${API}/v1/owner/service-requests/${requestId}/messages`, {
    headers: { ...headers, "idempotency-key": randomUUID() },
    data: { body: "รับทราบค่ะ ช่างจะโทรผ่านแอปก่อนเข้า" },
  });
  expect(officeReply.status(), await officeReply.text()).toBe(201);
  // The harness runs the API and its worker with in-memory pub/sub (no Redis), so the worker's realtime event never
  // reaches the API's stream here; the realtime re-read is covered on the mocks (requests.spec.ts). Read again.
  await resident.reload();
  await showThread(resident);
  await expect(resident.getByTestId("thread-messages")).toContainText("รับทราบค่ะ", { timeout: 30_000 });
  await expect(resident.getByTestId("thread-messages").locator('li[data-author="office"]')).toHaveCount(1);

  // 3. The technician: LINE sign-in on the technician app; the work order is theirs.
  await technicianContext.addCookies([fakeLiffCookie(baseURL!, TECHNICIAN_SUB, "ช่างประปา ทดสอบ")]);
  await technician.goto(`/liff?liff.state=${encodeURIComponent("/technician")}`);
  await expect(technician).toHaveURL(/\/technician$/, { timeout: 30_000 });
  await expect(technician.getByTestId("work-order-item")).toHaveCount(1);
  await technician.getByTestId("work-order-item").click();
  await expect(technician).toHaveURL(new RegExp(`/technician/work-orders/${workOrderId}$`));
  const workOrder = technician.getByTestId("work-order");
  await expect(workOrder).toHaveAttribute("data-status", "assigned");
  await expect(workOrder).toContainText("ช่วงเช้า");
  await expect(technician.getByTestId("wo-gallery-report").getByRole("listitem")).toHaveCount(1);
  // The same thread: the resident's and the office's messages; the technician answers the resident.
  await showThread(technician);
  const techThread = technician.getByTestId("request-thread");
  await expect(techThread.getByTestId("thread-messages")).toContainText("อยู่ห้องทั้งเช้าค่ะ (integration)");
  await expect(techThread.getByTestId("thread-messages")).toContainText("รับทราบค่ะ");
  await techThread.getByTestId("thread-input").fill("เข้าไป 9 โมงครับ (integration)");
  await techThread.getByTestId("thread-send").click();
  await expect(techThread.locator('li[data-author="technician"]')).toHaveCount(1, { timeout: 30_000 });
  await technician.getByTestId("wo-accept").click();
  await expect(workOrder).toHaveAttribute("data-status", "accepted");
  await technician.getByTestId("wo-check-in").click();
  await expect(workOrder).toHaveAttribute("data-status", "in_progress");

  const after = technician.getByTestId("wo-photos-after");
  await addPhoto(after, "wo-picker-after-add", "fixed.png");
  await after.getByTestId("wo-send-after").click();
  await expect(after.getByTestId("wo-sent-after")).toBeVisible({ timeout: 30_000 });
  await technician.getByTestId("wo-complete").click();
  await technician.getByTestId("wo-complete-submit").click();
  await expect(workOrder).toHaveAttribute("data-status", "done", { timeout: 30_000 });

  // 4. The resident: the technician's answer, done with the after photo and the whole history, rated, closed.
  await resident.reload();
  await expect(resident.getByTestId("request-detail")).toHaveAttribute("data-status", "done");
  await showThread(resident);
  await expect(resident.getByTestId("thread-messages")).toContainText("เข้าไป 9 โมงครับ (integration)");
  await expect(resident.getByTestId("request-after-photos").getByRole("listitem")).toHaveCount(1);
  // The API's status history (D-218): from "new" to "done", one entry per change.
  await expect
    .poll(() => resident.getByTestId("request-timeline").getByRole("listitem").count())
    .toBeGreaterThanOrEqual(4);
  await resident
    .getByTestId("request-rate")
    .locator("label", { has: resident.getByRole("radio", { name: "5 ดาว" }) })
    .click();
  await resident.getByTestId("request-rate-submit").click();
  await expect(resident.getByTestId("request-detail")).toHaveAttribute("data-status", "closed");

  const closed = await request.get(`${API}/v1/owner/service-requests/${requestId}`, { headers });
  expect(await closed.json()).toMatchObject({ status: "closed", rating: 5 });
  await residentContext.close();
  await technicianContext.close();
});
