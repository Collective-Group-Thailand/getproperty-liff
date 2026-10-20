/**
 * The resident's invoices, payments, slips and receipts in the mock API (L2). Shapes are the contract's
 * (`ResidentInvoiceDto`, `ResidentPaymentDto`, `ResidentSlipOutcomeDto`, `ResidentReceiptDetailDto`, adopted at
 * getproperty-api `57eef37`). Every amount is a fixed decimal string, as the API would compute it — the mock is
 * a fake engine, the app never adds anything up.
 *
 * Scenario words in the fake LINE subject (`mocks/state.ts`) pick the starting state:
 *
 *   (default)   one open invoice of A-201 due in 5 days (rent, electricity from the smart meter, water read
 *               from a photo, internet), two paid months with receipts
 *   …overdue…   the open invoice is past its due date (D-100: amber, never red)
 *   …duesoon…   the open invoice is due tomorrow
 *   …estimate…  the water line is an estimate (D-031), settled on the next invoice
 *   …noqr…      the landlord takes no QR payments: account for a transfer + slip
 *   …noslip…    slips are not accepted (`payments.allow_slip` off)
 *   …expiring…  the QR expires 8 seconds after it is shown (the API re-creates an expired one)
 *   …paidup…    nothing open
 *   …multi…     a second open invoice for B-105 (two units, two landlords)
 *
 * Mock-only control (never in the contract, never in a real build): `POST /v1/resident/__mock/invoices/{id}/pay`
 * plays the payment provider's callback — the invoice is paid, a receipt issued and `payment.confirmed`,
 * `invoice.paid`, `receipt.issued` go down the resident's realtime stream — the API publishes them to the payer's
 * `user:` and the invoice's `unit:` channels (contract request #16, closed in F2).
 */
import { createHash } from "node:crypto";

import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { mswPath, problem } from "./contract";
import { authenticate } from "./handlers";
import { bangkokDate } from "./residence";
import { UNIT_A, UNIT_B, type MockAccount } from "./state";
import { emit } from "./events";
import { bangkokIso } from "./tokens";

type Schemas = components["schemas"];
type Invoice = Schemas["ResidentInvoiceDto"];
type Line = Schemas["ResidentInvoiceLineDto"];
/** A line as the mock engine builds it; `LineExtra` adds its disclosure (D-012, D-022). */
type BaseLine = Omit<Line, "sourceType" | "readAt" | "readingPhotoUrl">;
type BaseInvoice = Omit<Invoice, "lines" | "unitId" | "receipts"> & { lines: BaseLine[] };
type Receipt = Schemas["ResidentReceiptDto"];
type SlipStatus = Schemas["SlipStatus"];

const DAY = 86_400_000;

/** What a line discloses (D-012, D-022): its source, when the closing reading was taken and its photo. */
export interface LineExtra {
  sourceType: Schemas["InvoiceLineSourceType"];
  readAt: string | null;
  readingPhotoUrl: string | null;
}

export interface MockInvoice {
  dto: BaseInvoice;
  extras: LineExtra[];
  unitId: string;
  receiptIds: string[];
}

/** A slip as the resident sees it after verification (`ResidentSlipOutcomeDto`). */
export interface MockSlip {
  id: string;
  invoiceId: string;
  status: SlipStatus;
  reasons: Schemas["SlipReason"][];
  uploadedAt: string;
  decidedAt: string | null;
  transRef: string | null;
}

export interface MockBilling {
  invoices: MockInvoice[];
  receipts: (Receipt & { invoiceIds: string[] })[];
  slips: MockSlip[];
  allowSlip: boolean;
  allowQr: boolean;
  qrTtlMs: number;
  /** Re-created when it expires or the amount changes, like the API. */
  qr: Map<string, { expiresAt: number; amount: string }>;
  /** Idempotent replays of `POST …/slips`: key → response body. */
  replays: Map<string, { status: number; body: unknown }>;
  /** The resident's in-app inbox (`GET /v1/resident/notifications`), newest first. */
  inbox: Schemas["InboxItemDto"][];
}

/** The landlord's account in the mock (masked like the API); slips must name these last 4 digits. */
export const MOCK_ACCOUNT = {
  bankNameTh: "ธนาคารตัวอย่าง",
  accountName: "บริษัท หอพักตัวอย่าง จำกัด",
  accountNoMasked: "xxx-x-x1234-x",
  accountNo: "1234561234",
  last4: "1234",
  bankCode: "004",
};

/** A small SVG "photo" of a meter register as a data URL (the API's are 5-minute signed links). */
function meterPhoto(label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="#d9e2e8"/><rect x="120" y="170" width="400" height="120" rx="12" fill="#1f2a30"/><text x="320" y="248" font-family="monospace" font-size="56" text-anchor="middle" fill="#f4f7f8">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** `YYYY-MM-01` of the month `offset` months from the Bangkok month of `ms`. */
function monthStart(ms: number, offset: number): string {
  const [year, month] = bangkokDate(ms).split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return date.toISOString().slice(0, 10);
}

function monthEnd(start: string): string {
  const [year, month] = start.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function line(
  no: number,
  kind: Line["lineKind"],
  fields: Partial<BaseLine> & { amount: string; description: string },
): BaseLine {
  return {
    lineNo: no,
    lineKind: kind,
    quantity: "1.000",
    unit: null,
    unitPrice: null,
    periodFrom: null,
    periodTo: null,
    registerFrom: null,
    registerTo: null,
    readingSource: null,
    isEstimated: false,
    aboveCap: false,
    units: fields.registerFrom !== undefined ? (fields.quantity ?? null) : null,
    ...fields,
  };
}

/**
 * Invoice ids are derived from the account's subject, unit and slot (`open`, `history-3` …), so a measured URL is stable: Lighthouse
 * signs in as `Ulighthouse-resident` and opens `/invoices/<id>` (lighthouse/resident.json; mocks.test.ts checks it).
 */
export function mockInvoiceId(subject: string, unitNo: string, slot: string): string {
  const hex = createHash("sha256").update(`${subject}#invoice#${unitNo}#${slot}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The open invoice of A-201 a default account gets. */
export function currentInvoiceId(subject: string): string {
  return mockInvoiceId(subject, UNIT_A.unitNo, "open");
}

let invoiceSeq = 40;
let receiptSeq = 0;

/** One month of A-201 (or B-105): rent, metered electricity and water (D-022), internet. */
function monthInvoice(
  subject: string,
  unit: typeof UNIT_A,
  start: string,
  options: { open: boolean; dueDate: string; estimate?: boolean; issuedAt: string; slot: string },
): MockInvoice {
  invoiceSeq += 1;
  const end = monthEnd(start);
  const b = unit.unitId === UNIT_B.unitId;
  const rent = b ? "3800.00" : "4500.00";
  const lines: BaseLine[] = [
    line(1, "rent", {
      description: `ค่าเช่าห้อง ${unit.unitNo}`,
      amount: rent,
      unit: "month",
      unitPrice: b ? "3800.0000" : "4500.0000",
      periodFrom: start,
      periodTo: end,
    }),
    line(2, "electricity", {
      description: "ค่าไฟฟ้า",
      quantity: "120.000",
      unit: "kwh",
      unitPrice: "7.0000",
      amount: "840.00",
      periodFrom: start,
      periodTo: end,
      registerFrom: "1114.500",
      registerTo: "1234.500",
      readingSource: "iot",
    }),
    line(3, "water", {
      description: "ค่าน้ำประปา",
      quantity: "12.000",
      unit: "m3",
      unitPrice: "18.0000",
      amount: "216.00",
      periodFrom: start,
      periodTo: end,
      registerFrom: "1203.000",
      registerTo: "1215.000",
      readingSource: options.estimate ? "estimated" : "ocr",
      isEstimated: options.estimate === true,
    }),
    line(4, "internet", { description: "ค่าอินเทอร์เน็ต", amount: "300.00", unit: "month", unitPrice: "300.0000" }),
  ];
  const total = b ? "5156.00" : "5856.00";
  const extras: LineExtra[] = [
    { sourceType: "rent", readAt: null, readingPhotoUrl: null },
    { sourceType: "meter", readAt: bangkokIso(Date.parse(`${end}T23:50:00+07:00`)), readingPhotoUrl: null },
    {
      sourceType: "meter",
      readAt: options.estimate ? null : bangkokIso(Date.parse(`${end}T18:20:00+07:00`)),
      readingPhotoUrl: options.estimate ? null : meterPhoto("01215.000"),
    },
    { sourceType: "service", readAt: null, readingPhotoUrl: null },
  ];
  const year = start.slice(0, 4);
  return {
    unitId: unit.unitId,
    extras,
    receiptIds: [],
    dto: {
      id: mockInvoiceId(subject, unit.unitNo, options.slot),
      number: `INV-${year}-${String(invoiceSeq).padStart(5, "0")}`,
      status: options.open ? "issued" : "paid",
      issuerName: unit.tenantName,
      unitNo: unit.unitNo,
      periodStart: start,
      periodEnd: end,
      issuedAt: options.issuedAt,
      dueDate: options.dueDate,
      isFinal: false,
      lines,
      total,
      priorBalance: "0.00",
      amountDue: total,
      balance: options.open ? total : "0.00",
      hasEstimate: options.estimate === true,
    },
  };
}

function receiptFor(invoice: MockInvoice, at: number, billing: MockBilling): Receipt & { invoiceIds: string[] } {
  receiptSeq += 1;
  const receipt = {
    id: crypto.randomUUID(),
    number: `RCP-${bangkokDate(at).slice(0, 4)}-${String(receiptSeq).padStart(5, "0")}`,
    kind: "payment" as const,
    amount: invoice.dto.amountDue,
    issuedAt: bangkokIso(at),
    issuerName: invoice.dto.issuerName,
    unitNo: invoice.dto.unitNo,
    voided: false,
    invoiceIds: [invoice.dto.id],
  };
  billing.receipts.unshift(receipt);
  invoice.receiptIds.push(receipt.id);
  return receipt;
}

const holder = globalThis as typeof globalThis & { __gpMockBilling?: Map<string, MockBilling> };
holder.__gpMockBilling ??= new Map();
const billings = holder.__gpMockBilling;

/** Billing events on the resident's own `user:` channel, as the API publishes them (D-208). */
function emitTo(account: MockAccount, type: string, ids: Record<string, string>): void {
  emit(account.userId, type, ids);
}

export function billingOf(account: MockAccount): MockBilling {
  const existing = billings.get(account.userId);
  if (existing) return existing;
  const has = (word: string) => account.subject.toLowerCase().includes(word);
  const now = Date.now();
  const billing: MockBilling = {
    invoices: [],
    receipts: [],
    slips: [],
    allowSlip: !has("noslip"),
    allowQr: !has("noqr"),
    qrTtlMs: has("expiring") ? 8_000 : 15 * 60_000,
    qr: new Map(),
    replays: new Map(),
    inbox: [],
  };
  billings.set(account.userId, billing);
  if (account.units.length === 0) return billing;

  // History: two months paid on time, each with its receipt (newest first, like the API).
  for (const offset of [-3, -2]) {
    const start = monthStart(now, offset);
    const issued = Date.parse(`${monthStart(now, offset + 1)}T09:00:00+07:00`);
    const invoice = monthInvoice(account.subject, UNIT_A, start, {
      open: false,
      issuedAt: bangkokIso(issued),
      dueDate: bangkokDate(issued + 5 * DAY),
      slot: `history${offset}`,
    });
    billing.invoices.unshift(invoice);
    receiptFor(invoice, issued + 3 * DAY, billing);
  }
  if (!has("paidup")) {
    const due = has("overdue") ? now - 3 * DAY : has("duesoon") ? now + DAY : now + 5 * DAY;
    const current = monthInvoice(account.subject, UNIT_A, monthStart(now, -1), {
      open: true,
      issuedAt: bangkokIso(due - 8 * DAY),
      dueDate: bangkokDate(due),
      estimate: has("estimate"),
      slot: "open",
    });
    if (has("overdue")) current.dto.status = "overdue";
    billing.invoices.unshift(current);
    notify(
      billing,
      "invoice.issued",
      "บิลค่าเช่าและค่าน้ำไฟพร้อมแล้ว",
      `บิล ${current.dto.number} ห้อง ${UNIT_A.unitNo} ยอด ${current.dto.balance} บาท`,
      Date.parse(current.dto.issuedAt),
    );
  }
  if (has("multi")) {
    const other = monthInvoice(account.subject, UNIT_B, monthStart(now, -1), {
      open: true,
      issuedAt: bangkokIso(now - 2 * DAY),
      dueDate: bangkokDate(now + 10 * DAY),
      slot: "open",
    });
    billing.invoices.unshift(other);
  }
  return billing;
}

function notify(billing: MockBilling, eventType: string, title: string, body: string, at = Date.now()): void {
  billing.inbox.unshift({
    id: crypto.randomUUID(),
    eventType,
    title,
    body,
    state: "delivered",
    createdAt: bangkokIso(at),
    readAt: null,
  });
}

const OPEN = new Set(["issued", "partially_paid", "overdue"]);
const isOpen = (invoice: MockInvoice) => OPEN.has(invoice.dto.status);

/** The invoice as the contract publishes it: its unit, lines with their disclosure and its receipts. */
export function invoiceView(invoice: MockInvoice, billing: MockBilling): Invoice {
  return {
    ...invoice.dto,
    unitId: invoice.unitId,
    lines: invoice.dto.lines.map((l, index) => ({ ...l, ...invoice.extras[index]! })),
    receipts: invoice.receiptIds
      .map((id) => billing.receipts.find((r) => r.id === id))
      .filter((r) => r !== undefined)
      .map((r) => ({ id: r.id, number: r.number })),
  };
}

/** Earlier open invoices of the same unit count towards what is due now (D-193). Mock: one open per unit. */
function dueNow(invoice: MockInvoice): string {
  return isOpen(invoice) ? invoice.dto.balance : "0.00";
}

// ── Thai QR (EMVCo, Tag 30 bill payment), so the mock QR scans like a real one ─────────────────────────────
function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, "0")}${value}`;
}

function crc16(text: string): string {
  let crc = 0xffff;
  for (const char of Buffer.from(text, "ascii")) {
    crc ^= char << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function thaiQrPayload(reference: string, amount: string): string {
  const merchant = tlv("00", "A000000677010112") + tlv("01", "010555000000101") + tlv("02", reference);
  const body =
    tlv("00", "01") + tlv("01", "12") + tlv("30", merchant) + tlv("53", "764") + tlv("54", amount) + tlv("58", "TH");
  return `${body}6304${crc16(`${body}6304`)}`;
}

function paymentView(invoice: MockInvoice, billing: MockBilling): Schemas["ResidentPaymentDto"] {
  const due = dueNow(invoice);
  const reference = invoice.dto.number.replace(/-/g, "");
  let qr: Schemas["ResidentQrDto"] | null = null;
  if (billing.allowQr && due !== "0.00") {
    const current = billing.qr.get(invoice.dto.id);
    const now = Date.now();
    const entry =
      current && current.expiresAt > now && current.amount === due
        ? current
        : { expiresAt: now + billing.qrTtlMs, amount: due };
    billing.qr.set(invoice.dto.id, entry);
    qr = { payload: thaiQrPayload(reference, due), amount: due, reference, expiresAt: bangkokIso(entry.expiresAt) };
  }
  const account = {
    bankNameTh: MOCK_ACCOUNT.bankNameTh,
    accountName: MOCK_ACCOUNT.accountName,
    accountNoMasked: MOCK_ACCOUNT.accountNoMasked,
    // The full number only while something is due (D-209), and the bank's code to offer its app first.
    accountNo: due !== "0.00" ? MOCK_ACCOUNT.accountNo : null,
    bankCode: MOCK_ACCOUNT.bankCode,
  };
  return {
    invoiceId: invoice.dto.id,
    number: invoice.dto.number,
    due,
    qr,
    account,
    allowSlip: billing.allowSlip,
    allowPartial: false,
  };
}

/** The provider's callback, or an auto-confirmed slip: paid in full, receipt, events (D-042, D-044). */
export function payInvoice(account: MockAccount, billing: MockBilling, invoice: MockInvoice, via: "qr" | "slip") {
  if (!isOpen(invoice)) return;
  const now = Date.now();
  invoice.dto.status = "paid";
  invoice.dto.balance = "0.00";
  billing.qr.delete(invoice.dto.id);
  const receipt = receiptFor(invoice, now, billing);
  notify(billing, "receipt.issued", "ได้รับชำระเงินแล้ว", `ใบเสร็จ ${receipt.number} ยอด ${receipt.amount} บาท`, now);
  const paymentId = crypto.randomUUID();
  emitTo(account, "payment.confirmed", { paymentId, invoiceId: invoice.dto.id, via });
  emitTo(account, "invoice.paid", { invoiceId: invoice.dto.id });
  emitTo(account, "receipt.issued", { receiptId: receipt.id });
}

/** The same rules as the API's slip verification (D-043, D-198), on the fake verifier's JSON trailer. */
function verifySlip(account: MockAccount, billing: MockBilling, slip: MockSlip, bytes: Buffer): void {
  const invoice = billing.invoices.find((i) => i.dto.id === slip.invoiceId);
  if (!invoice) return;
  const text = bytes.toString("latin1");
  const start = text.indexOf('{"transRef"');
  const reasons: Schemas["SlipReason"][] = [];
  let duplicate = false;
  let parsed: Record<string, string> | null = null;
  if (start >= 0) {
    try {
      parsed = JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)) as Record<string, string>;
    } catch {
      parsed = null;
    }
  }
  if (!parsed) reasons.push("not_recognised");
  else {
    slip.transRef = parsed.transRef ?? null;
    if (
      slip.transRef &&
      billing.slips.some(
        (s) => s.id !== slip.id && s.transRef === slip.transRef && !["duplicate", "rejected"].includes(s.status),
      )
    ) {
      reasons.push("duplicate_reference");
      duplicate = true;
    }
    const receiver = (parsed.receiverAccount ?? "").replace(/\D/g, "");
    if (receiver.slice(-4) !== MOCK_ACCOUNT.last4) reasons.push("receiver_mismatch");
    const amount = parsed.amount ? Number(parsed.amount).toFixed(2) : null;
    const due = dueNow(invoice);
    if (!amount) reasons.push("amount_unreadable");
    else if (Number(amount) > Number(due)) reasons.push("amount_above_due");
    else if (Number(amount) < Number(due)) reasons.push("amount_below_due");
  }
  slip.reasons = reasons;
  slip.status = duplicate ? "duplicate" : reasons.length ? "pending_review" : "auto_confirmed";
  slip.decidedAt = bangkokIso(Date.now());
  if (slip.status === "auto_confirmed") payInvoice(account, billing, invoice, "slip");
  else emitTo(account, "slip.review_requested", { slipReviewId: slip.id, invoiceId: invoice.dto.id });
}

function slipView(slip: MockSlip) {
  return {
    id: slip.id,
    status: slip.status,
    reasons: slip.reasons,
    uploadedAt: slip.uploadedAt,
    decidedAt: slip.decidedAt,
  };
}

const MAX_SLIP_BYTES = 5 * 1024 * 1024;
const SLIP_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
/** How long the mock "verifier" takes, so the app shows the pending state first. */
const VERIFY_DELAY_MS = 1200;

/** A one-page PDF standing in for the document links (the API's are 5-minute signed object-storage URLs). */
function pdf(title: string): Uint8Array {
  const text = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length 44>>stream\nBT /F1 18 Tf 72 760 Td (${title}) Tj ET\nendstream\nendobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`;
  return new TextEncoder().encode(text);
}

function documentLink(kind: "invoices" | "receipts", id: string, number: string) {
  return {
    documentId: crypto.randomUUID(),
    number,
    // The mock serves the PDF through the BFF; the API's link points at object storage.
    url: `/bff/v1/resident/__mock/documents/${kind}/${id}.pdf`,
    expiresAt: bangkokIso(Date.now() + 5 * 60_000),
  };
}

export const billingHandlers: HttpHandler[] = [
  http.get(mswPath("/v1/resident/invoices"), ({ request }) => {
    const op = "resident.invoices.list";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const billing = billingOf(auth.account);
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("perPage") ?? 25)));
    const status = url.searchParams.get("status");
    const unpaid = url.searchParams.get("unpaid") === "true";
    const all = billing.invoices.filter(
      (i) => (!unpaid || isOpen(i)) && (!status || i.dto.status === status) && i.dto.status !== "draft",
    );
    return HttpResponse.json({
      data: all.slice((page - 1) * perPage, page * perPage).map((i) => invoiceView(i, billing)),
      meta: { page, perPage, total: all.length },
    });
  }),

  http.get(mswPath("/v1/resident/invoices/:invoiceId"), ({ request, params }) => {
    const op = "resident.invoices.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const billing = billingOf(auth.account);
    const invoice = billing.invoices.find((i) => i.dto.id === params.invoiceId);
    if (!invoice) return problem(op, "http.not_found");
    return HttpResponse.json(invoiceView(invoice, billing));
  }),

  http.get(mswPath("/v1/resident/invoices/:invoiceId/payment"), ({ request, params }) => {
    const op = "resident.invoices.payment";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const billing = billingOf(auth.account);
    const invoice = billing.invoices.find((i) => i.dto.id === params.invoiceId);
    if (!invoice) return problem(op, "http.not_found");
    return HttpResponse.json(paymentView(invoice, billing));
  }),

  http.get(mswPath("/v1/resident/invoices/:invoiceId/document"), ({ request, params }) => {
    const op = "resident.invoices.document";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const invoice = billingOf(auth.account).invoices.find((i) => i.dto.id === params.invoiceId);
    if (!invoice) return problem(op, "http.not_found");
    return HttpResponse.json(documentLink("invoices", invoice.dto.id, invoice.dto.number));
  }),

  http.post(mswPath("/v1/resident/invoices/:invoiceId/slips"), async ({ request, params }) => {
    const op = "resident.invoices.uploadSlip";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const billing = billingOf(auth.account);
    const invoice = billing.invoices.find((i) => i.dto.id === params.invoiceId);
    if (!invoice) return problem(op, "http.not_found");
    // An optional `Idempotency-Key` makes a retried upload answer the first slip (D-208).
    const key = request.headers.get("idempotency-key");
    const replayKey = key ? `${invoice.dto.id} ${key}` : null;
    const seen = replayKey ? billing.replays.get(replayKey) : undefined;
    if (seen) {
      return HttpResponse.json(seen.body as Record<string, unknown>, {
        status: seen.status,
        headers: { "idempotent-replayed": "true" },
      });
    }
    let body: { image?: unknown; mimeType?: unknown } | null = null;
    try {
      body = (await request.json()) as { image?: unknown; mimeType?: unknown };
    } catch {
      body = null;
    }
    if (typeof body?.image !== "string" || typeof body.mimeType !== "string" || !SLIP_TYPES.has(body.mimeType)) {
      return problem(op, "validation.failed");
    }
    const bytes = Buffer.from(body.image, "base64");
    if (bytes.length === 0) return problem(op, "validation.failed");
    if (bytes.length > MAX_SLIP_BYTES) return problem(op, "http.payload_too_large");
    if (!billing.allowSlip) return problem(op, "slip.not_allowed");
    if (!isOpen(invoice)) return problem(op, "invoice.nothing_due");
    const slip: MockSlip = {
      id: crypto.randomUUID(),
      invoiceId: invoice.dto.id,
      status: "pending_verification",
      reasons: [],
      uploadedAt: bangkokIso(Date.now()),
      decidedAt: null,
      transRef: null,
    };
    billing.slips.unshift(slip);
    setTimeout(() => verifySlip(auth.account, billing, slip, bytes), VERIFY_DELAY_MS);
    const result = { id: slip.id, status: slip.status, uploadedAt: slip.uploadedAt };
    if (replayKey) billing.replays.set(replayKey, { status: 201, body: result });
    return HttpResponse.json(result, { status: 201 });
  }),

  // My slips of an invoice with the verification outcome and its reasons.
  http.get(mswPath("/v1/resident/invoices/:invoiceId/slips"), ({ request, params }) => {
    const op = "resident.invoices.slips";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const billing = billingOf(auth.account);
    if (!billing.invoices.some((i) => i.dto.id === params.invoiceId)) return problem(op, "http.not_found");
    return HttpResponse.json({ data: billing.slips.filter((s) => s.invoiceId === params.invoiceId).map(slipView) });
  }),

  http.get(mswPath("/v1/resident/receipts"), ({ request }) => {
    const op = "resident.receipts.list";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const billing = billingOf(auth.account);
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("perPage") ?? 25)));
    const data = billing.receipts.map(({ invoiceIds: _ids, ...r }) => r);
    return HttpResponse.json({
      data: data.slice((page - 1) * perPage, page * perPage),
      meta: { page, perPage, total: data.length },
    });
  }),

  // One receipt with the invoices it paid (the API's LINE messages link `/receipts/{id}`).
  http.get(mswPath("/v1/resident/receipts/:receiptId"), ({ request, params }) => {
    const op = "resident.receipts.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const billing = billingOf(auth.account);
    const receipt = billing.receipts.find((r) => r.id === params.receiptId);
    if (!receipt) return problem(op, "http.not_found");
    const { invoiceIds, ...dto } = receipt;
    return HttpResponse.json({
      ...dto,
      hasDocument: true,
      invoices: invoiceIds
        .map((id) => billing.invoices.find((i) => i.dto.id === id))
        .filter((i) => i !== undefined)
        .map((i) => ({ id: i.dto.id, number: i.dto.number })),
    });
  }),

  http.get(mswPath("/v1/resident/receipts/:receiptId/document"), ({ request, params }) => {
    const op = "resident.receipts.document";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const receipt = billingOf(auth.account).receipts.find((r) => r.id === params.receiptId);
    if (!receipt) return problem(op, "http.not_found");
    return HttpResponse.json(documentLink("receipts", receipt.id, receipt.number));
  }),

  http.get(mswPath("/v1/resident/notifications"), ({ request }) => {
    const op = "resident.notifications.list";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const limit = Math.min(100, Math.max(1, Number(new URL(request.url).searchParams.get("limit") ?? 50)));
    return HttpResponse.json({ data: billingOf(auth.account).inbox.slice(0, limit), meta: { nextCursor: null } });
  }),

  // ── mock-only controls (e2e, `pnpm dev:mock`) ──────────────────────────────────────────────────────────────
  http.post(mswPath("/v1/resident/__mock/invoices/:invoiceId/pay"), ({ request, params }) => {
    const auth = authenticate(request, "resident", "resident.invoices.get");
    if (auth instanceof Response) return auth;
    const billing = billingOf(auth.account);
    const invoice = billing.invoices.find((i) => i.dto.id === params.invoiceId);
    if (!invoice) return problem("resident.invoices.get", "http.not_found");
    payInvoice(auth.account, billing, invoice, "qr");
    return HttpResponse.json(invoiceView(invoice, billing));
  }),

  http.get(mswPath("/v1/resident/__mock/documents/:kind/:file"), ({ params }) => {
    const title = `getproperty mock ${String(params.kind)} ${String(params.file).replace(/\.pdf$/, "")}`;
    return new HttpResponse(pdf(title), { headers: { "content-type": "application/pdf" } });
  }),
];
