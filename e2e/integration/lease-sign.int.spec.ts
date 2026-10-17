import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { API_PORT, intDatabase, ownerAccessToken, setLatestOtpCode } from "./harness";

/**
 * L3 3.1 against the real getproperty-api (no mocks): the office drafts a lease for a party, sends it for
 * signature and invites the lessee (LINE QR code); the resident opens the invitation in the fake LIFF, consents,
 * links, reads the lease to the end, draws a signature, confirms with the SMS code and sees the document hash; the
 * office countersigns; the resident's lease is in force (D-061, D-062).
 *
 * The office's side is driven over HTTP with an operator session of the dev seed's Owner (`ownerAccessToken`). SMS codes stay in the
 * fake SMS adapter's memory, so the test replaces the newest challenge's code hash with one it knows.
 */
const API = `http://127.0.0.1:${API_PORT}`;
const RESIDENT_SUB = "U00000000000000000000000l3signer01";
const RESIDENT_PHONE = "+66810007788";
const CODE = "246810";
/** 1×1 PNG, the office's countersignature. */
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** A Thai ID with a valid check digit (a generated fixture, not a person). */
function thaiId(prefix12: string): string {
  const sum = [...prefix12].reduce((acc, d, i) => acc + Number(d) * (13 - i), 0);
  return `${prefix12}${(11 - (sum % 11)) % 10}`;
}

test("the office sends a lease; the resident links, reads, signs with OTP; countersigned → in force", async ({
  page,
  context,
  baseURL,
  request,
}) => {
  test.setTimeout(180_000);
  const owner = await ownerAccessToken(request);
  const headers = { authorization: `Bearer ${owner}` };

  // The office: a party with a phone (the signature OTP goes there), a lease on a free unit, sent, invitation.
  const db = await intDatabase();
  let unitId: string;
  try {
    const { rows } = await db.query<{ id: string }>(
      `SELECT u.id FROM core.unit u WHERE u.unit_no = 'A-103' AND u.tenant_id = '0199f2a0-0000-7000-8000-000000000001'`,
    );
    unitId = rows[0]!.id;
  } finally {
    await db.end();
  }
  const party = await request.post(`${API}/v1/owner/parties`, {
    headers,
    data: {
      type: "person",
      displayName: "ผู้เช่า ลงนาม",
      phone: RESIDENT_PHONE,
      nationality: "TH",
      idDocumentType: "thai_national_id",
      idNumber: thaiId("130000000000"),
    },
  });
  expect(party.status(), await party.text()).toBe(201);
  const partyId = ((await party.json()) as { id: string }).id;
  const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
  const draft = await request.post(`${API}/v1/owner/leases`, {
    headers,
    data: {
      unitId,
      lesseePartyId: partyId,
      startDate: today,
      months: 12,
      addendum: [{ type: "house_rules", title: "ระเบียบอาคาร", text: "งดส่งเสียงดังหลัง 22:00 น." }],
    },
  });
  expect(draft.status(), await draft.text()).toBe(201);
  const leaseId = ((await draft.json()) as { id: string }).id;
  const sent = await request.post(`${API}/v1/owner/leases/${leaseId}/actions/send-for-signature`, {
    headers: { ...headers, "idempotency-key": randomUUID() },
  });
  expect(sent.status(), await sent.text()).toBe(200);
  const contractSha = ((await sent.json()) as { contract: { sha256: string } }).contract.sha256;
  const invitation = await request.post(`${API}/v1/owner/leases/${leaseId}/invitations`, {
    headers,
    data: { channel: "line_qr" },
  });
  expect(invitation.status(), await invitation.text()).toBe(201);
  const code = ((await invitation.json()) as { code: string }).code;

  // The resident: the invite QR opens the LIFF; consent comes first (D-025), then the link (D-061).
  await context.addCookies([
    {
      name: "gp_fake_liff",
      value: encodeURIComponent(JSON.stringify({ sub: RESIDENT_SUB, name: "ผู้เช่า ลงนาม" })),
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

  // The lease (the refreshed session carries `lease:<id>`), then the signature.
  await expect(page).toHaveURL(new RegExp(`/lease/${leaseId}$`));
  await expect(page.getByTestId("lease-view")).toContainText("รอลงนาม");
  await page.getByTestId("lease-sign").click();
  const reader = page.getByTestId("sign-reader");
  await reader.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.getByRole("checkbox", { name: "ฉันอ่านสัญญาเช่าทั้งหมดแล้วและตกลงตามสัญญา" }).click();
  await page.getByTestId("sign-read-next").click();
  const pad = page.getByTestId("signature-pad");
  const box = (await pad.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 6 });
  await page.mouse.move(box.x + 200, box.y + 40, { steps: 6 });
  await page.mouse.up();
  await page.getByTestId("sign-draw-next").click();
  await expect(page.getByTestId("sign-otp-lead")).toContainText("7788");
  await setLatestOtpCode("lease_signature", CODE);
  await page.getByRole("textbox", { name: "หลักที่ 1" }).fill(CODE);
  await expect(page.getByTestId("sign-done")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("sign-hash")).toHaveText(contractSha);

  // The office countersigns: the lease is in force.
  const countersigned = await request.post(`${API}/v1/owner/leases/${leaseId}/actions/countersign`, {
    headers: { ...headers, "idempotency-key": randomUUID() },
    data: { signaturePng: PNG },
  });
  expect(countersigned.status(), await countersigned.text()).toBe(200);
  expect(((await countersigned.json()) as { status: string }).status).toBe("active");

  await page.getByRole("link", { name: "กลับไปที่สัญญาเช่า" }).click();
  const view = page.getByTestId("lease-view");
  await expect(view.getByText("มีผล", { exact: false }).first()).toBeVisible();
  await expect(page.getByTestId("lease-parties")).toContainText("ลงนามเมื่อ");
  const lease = await page.request.get(`/bff/v1/resident/leases/${leaseId}`);
  expect(await lease.json()).toMatchObject({ status: "active", signatureRequired: false });
});
