import { createHmac, randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";

import { API_PORT, intDatabase, ownerAccessToken, setLatestOtpCode } from "./harness";

/**
 * L2 against the real getproperty-api (no mocks): the office connects its bank account through the fake payment
 * provider (KBank, merchant reference, OTP-confirmed) and issues an invoice to a resident; the resident opens it from
 * the LINE link (`/invoices/{id}`), sees the lines and the Thai QR the API created for what is due (D-042, D-197);
 * the provider's signed callback arrives at `/webhooks/payments/kbank`; the API's worker confirms the payment, the
 * invoice turns paid in the open sheet, and the receipt (D-044) is one tap away.
 *
 * The resident is a party of its own (another LINE user than `resident.int.spec.ts`), with an occupancy of a free
 * dev unit; the invoice is a draft written into `ops.invoice` and issued through the owner API, as the API's own
 * B4.4 suite does. The callback is signed with the fake provider's per-merchant secret
 * (`fake-<provider>-webhook-<merchantRef>`, getproperty-api `fake-payment-providers.ts`).
 */
const API = `http://127.0.0.1:${API_PORT}`;
const DEV_TENANT = "0199f2a0-0000-7000-8000-000000000001";
const RESIDENT_SUB = "U0000000000000000000000l2payer0001";
const MERCHANT = "010555000000777";
const CODE = "135790";

function signedCallback(merchantRef: string, reference: string, amount: string, providerRef: string) {
  const body = JSON.stringify({
    eventId: `evt_${providerRef}`,
    merchantRef,
    payments: [{ providerRef, reference, amount, paidAt: new Date().toISOString(), status: "paid" }],
  });
  const signature = `sha256=${createHmac("sha256", `fake-kbank-webhook-${merchantRef}`).update(body).digest("hex")}`;
  return { body, headers: { "content-type": "application/json", "x-provider-signature": signature } };
}

test("issued invoice → resident opens it → Thai QR → provider callback → paid → receipt", async ({
  page,
  context,
  baseURL,
  request,
}) => {
  test.setTimeout(240_000);
  const owner = await ownerAccessToken(request);
  const headers = { authorization: `Bearer ${owner}` };

  // The office: its own account at the (fake) provider, confirmed with the Owner's OTP (D-042).
  const created = await request.post(`${API}/v1/owner/bank-accounts`, {
    headers: { ...headers, "idempotency-key": randomUUID() },
    data: {
      bankCode: "004",
      bankNameTh: "ธนาคารกสิกรไทย",
      accountNo: "123-4-56789-0",
      accountName: "บริษัท หอพักทดสอบ จำกัด",
      isDefault: true,
      paymentProvider: "kbank",
      providerMerchantRef: MERCHANT,
    },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { account, otp } = (await created.json()) as { account: { id: string }; otp: { challengeId: string } };
  await setLatestOtpCode("bank_account_change", CODE);
  const confirmed = await request.post(`${API}/v1/owner/bank-accounts/${account.id}/actions/confirm`, {
    headers,
    data: { challengeId: otp.challengeId, code: CODE },
  });
  expect(confirmed.status(), await confirmed.text()).toBe(200);

  // The resident's party and occupancy, and a draft invoice billed to it.
  const db = await intDatabase();
  let invoiceId: string;
  try {
    const unit = await db.query<{ id: string; building_id: string; unit_no: string }>(
      `SELECT u.id, u.building_id, u.unit_no FROM core.unit u
        WHERE u.tenant_id = $1 AND u.unit_no <> 'A-103'
          AND NOT EXISTS (SELECT 1 FROM core.occupancy o WHERE o.unit_id = u.id)
        ORDER BY u.unit_no LIMIT 1`,
      [DEV_TENANT],
    );
    const { id: unitId, building_id: buildingId } = unit.rows[0]!;
    const party = await db.query<{ id: string }>(
      `INSERT INTO core.party (tenant_id, type, display_name, line_user_id, language)
       VALUES ($1, 'person', 'ผู้เช่า จ่ายบิล', $2, 'th') RETURNING id`,
      [DEV_TENANT, RESIDENT_SUB],
    );
    await db.query(
      `INSERT INTO core.occupancy (tenant_id, building_id, unit_id, party_id, role, valid_from)
       VALUES ($1, $2, $3, $4, 'tenant', '2026-01-01')`,
      [DEV_TENANT, buildingId, unitId, party.rows[0]!.id],
    );
    const invoice = await db.query<{ id: string }>(
      `INSERT INTO ops.invoice (tenant_id, building_id, unit_id, billed_party_id, period_start, period_end,
                                subtotal, total, balance)
       VALUES ($1, $2, $3, $4, '2026-09-01', '2026-09-30', 5344.00, 5344.00, 5344.00) RETURNING id`,
      [DEV_TENANT, buildingId, unitId, party.rows[0]!.id],
    );
    invoiceId = invoice.rows[0]!.id;
    // A meter line carries its readings, units, the utility tariff version and the cap it was compared with
    // (D-021a, D-022; `invoice_line_meter_check`): the dev seed's tariff version, a price below its cap.
    const tariff = await db.query<{ id: string }>(`SELECT id FROM platform.utility_tariff_version LIMIT 1`);
    expect(tariff.rows[0], "the reference seed publishes utility tariff versions").toBeTruthy();
    await db.query(
      `INSERT INTO ops.invoice_line (tenant_id, invoice_id, line_no, source_type, line_kind, description, quantity, unit,
                                     unit_price, amount, period_from, period_to, register_from, register_to, units,
                                     reading_source, utility_tariff_version_id, cap_per_unit, meter_segments)
       VALUES ($1, $2, 1, 'rent', 'rent', 'ค่าเช่าห้อง ก.ย. 2569', 1, 'month', 4500, 4500.00, '2026-09-01', '2026-09-30',
               NULL, NULL, NULL, NULL, NULL, NULL, NULL),
              ($1, $2, 2, 'meter', 'electricity', 'ค่าไฟฟ้า', 120, 'kwh', 4.0000, 480.00, '2026-09-01', '2026-09-30',
               1114.5, 1234.5, 120, 'manual', $3, 4.1825, $4::jsonb),
              ($1, $2, 3, 'service', 'internet', 'ค่าอินเทอร์เน็ต', 1, 'month', 364, 364.00, NULL, NULL,
               NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
      [
        DEV_TENANT,
        invoiceId,
        tariff.rows[0]!.id,
        // The meter segment the bill discloses (opening and closing register, D-022; `compliance.bill_disclosure`).
        JSON.stringify([
          {
            meterAssignmentId: randomUUID(),
            code: "E-1",
            from: { readingId: null, register: "1114.500", readAt: "2026-08-31T23:59:00+07:00", source: "manual" },
            to: { readingId: null, register: "1234.500", readAt: "2026-09-30T23:59:00+07:00", source: "manual" },
            units: "120.000",
          },
        ]),
      ],
    );
  } finally {
    await db.end();
  }
  const issued = await request.post(`${API}/v1/owner/invoices/${invoiceId}/actions/issue`, {
    headers: { ...headers, "idempotency-key": randomUUID() },
    data: {},
  });
  expect(issued.status(), await issued.text()).toBe(200);
  const number = ((await issued.json()) as { number: string }).number;
  const reference = number.replace(/-/g, "");

  // The resident opens the LINE link: sign-in (line_match links the party), consent, then the invoice.
  await context.addCookies([
    {
      name: "gp_fake_liff",
      value: encodeURIComponent(JSON.stringify({ sub: RESIDENT_SUB, name: "ผู้เช่า จ่ายบิล" })),
      url: baseURL!,
    },
  ]);
  await page.goto(`/liff?liff.state=${encodeURIComponent(`/invoices/${invoiceId}`)}`);
  await expect(page).toHaveURL(/\/consent\?next=/, { timeout: 30_000 });
  await page.locator('[data-purpose="resident.service"]').getByRole("checkbox").click();
  await page.getByTestId("consent-submit").click();
  await expect(page).toHaveURL(new RegExp(`/invoices/${invoiceId}$`));

  const detail = page.getByTestId("invoice-detail");
  await expect(detail).toHaveAttribute("data-status", "issued");
  await expect(detail).toContainText(number);
  await expect(page.getByTestId("invoice-summary")).toContainText("฿5,344.00");
  const electricity = page.locator('[data-testid="invoice-line"][data-kind="electricity"]');
  await expect(electricity).toContainText("จดโดยเจ้าหน้าที่");
  await expect(electricity.getByTestId("units-times-price")).toHaveText("120 kWh × 4.00 บาท = ฿480.00");

  // The pay sheet: the API's Thai QR for what is due, through the office's own merchant (Tag 30).
  await page.getByTestId("invoice-pay").click();
  const sheet = page.getByRole("dialog");
  const qr = sheet.getByTestId("pay-qr");
  await expect(qr).toBeVisible({ timeout: 30_000 });
  const payload = (await qr.getAttribute("data-payload"))!;
  expect(payload).toMatch(/^000201010212/);
  expect(payload).toContain(MERCHANT);
  expect(payload).toContain(reference);
  expect(payload).toContain("5344.00");
  await expect(sheet.getByTestId("pay-reference")).toHaveText(reference);
  await expect(sheet).toContainText("฿5,344.00");

  // The provider's signed callback; the worker confirms and allocates (D-042, D-197).
  const callback = signedCallback(MERCHANT, reference, "5344.00", `KB-L2-${Date.now()}`);
  const delivered = await request.post(`${API}/webhooks/payments/kbank`, {
    headers: callback.headers,
    data: callback.body,
  });
  expect(delivered.status(), await delivered.text()).toBe(200);
  expect(await delivered.json()).toEqual({ received: true, duplicate: false });

  // Paid in the open sheet: `payment.confirmed` / `invoice.paid` reach the resident's `user:` channel (D-208); the
  // sheet's slow poll covers a stream that has not connected yet.
  await expect(sheet.getByTestId("pay-paid")).toBeVisible({ timeout: 90_000 });
  await expect(sheet.getByRole("heading", { name: "ได้รับเงินแล้ว" })).toBeVisible();

  // The receipt the worker issued on payment.confirmed (D-044, D-196): the paid state links it directly once the
  // invoice lists it (`ResidentInvoiceDto.receipts`, D-208), else the receipts list.
  await sheet.getByTestId("pay-receipt").click();
  await expect(page).toHaveURL(/\/receipts(\/[0-9a-f-]{36})?$/);
  if (/\/receipts$/.test(page.url())) {
    // The worker numbers the receipt right after the payment; the list is rendered on the server.
    const item = page.getByTestId("receipt-item").first();
    await expect
      .poll(
        async () => {
          if (await item.count()) return item.textContent();
          await page.reload();
          return null;
        },
        { timeout: 30_000, intervals: [1_000] },
      )
      .toMatch(/RCP-\d{4}-\d{5}/);
    await expect(item).toContainText("฿5,344.00");
    await item.click();
  }
  const receipt = page.getByTestId("receipt-detail");
  await expect(receipt).toContainText("฿5,344.00");
  await expect(receipt).toContainText(/RCP-\d{4}-\d{5}/);

  const invoice = await page.request.get(`/bff/v1/resident/invoices/${invoiceId}`);
  expect(await invoice.json()).toMatchObject({ status: "paid", balance: "0.00" });
  await page.goto(`/invoices/${invoiceId}`);
  await expect(page.getByTestId("invoice-detail")).toHaveAttribute("data-status", "paid");
  await expect(page.getByTestId("invoice-pay")).toHaveCount(0);
});
