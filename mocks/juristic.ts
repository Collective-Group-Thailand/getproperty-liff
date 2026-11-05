/**
 * JL1 — a co-owner's money with the juristic office in the mock API (api J1.1b–J1.2b, D-304 … D-308, D-325, D-326):
 * monthly statements, the building's budget against what was billed, payment plans, recurring-payment mandates and
 * debt-clearance certificates. Shapes are the contract's (`StatementDto`, `BudgetActualIncomeDto`, `PaymentPlanDto`,
 * `PaymentMandateDto`, `DebtClearanceDto`); the figures are this fake engine's — the app never adds anything up.
 *
 * Scenario words in the fake LINE subject (with `…coowner…` / `…village…`, `mocks/state.ts`):
 *
 *   …planactive…     an approved plan with its first instalment paid (the record shows instalments, next due)
 *   …recurringoff…   no recurring provider (O-020): creating a mandate answers 409 `recurring.unavailable`
 *   …autopay…        an active direct-debit mandate on every owned unit
 *   …clearancefee…   the certificate has a fee: a request waits (`requested`) instead of being issued at once
 *   …stmpending…     the newest statement's PDF is still being prepared (409 `statement.document_pending`)
 *   …nobudget…       no approved budget for the building (404 on budget-vs-actual)
 *
 * Mock-only controls (never in the contract or a real build):
 *   `POST /v1/resident/__mock/units/{unitId}/payment-plans/{planId}/approve` — the office approves a request;
 *   `GET /v1/resident/__mock/recurring/setup/{mandateId}` — the provider's authorisation page: activates the mandate.
 */
import { http, HttpResponse, type HttpHandler, type JsonBodyType } from "msw";

import type { components } from "../src/lib/api/schema";
import { billingOf, type MockInvoice } from "./billing";
import { mswPath, problem } from "./contract";
import { authenticate } from "./handlers";
import { bangkokDate } from "./residence";
import type { MockAccount } from "./state";
import { bangkokIso } from "./tokens";
import { myUnitsOf } from "./unitRoles";

type Schemas = components["schemas"];
type Plan = Schemas["PaymentPlanDto"];
type Mandate = Schemas["PaymentMandateDto"];
type Clearance = Schemas["DebtClearanceDto"];

const DAY = 86_400_000;
const PLAN_MAX_INSTALMENTS = 12;
const CLEARANCE_VALIDITY_DAYS = 30;

interface JuristicStore {
  plans: Plan[];
  mandates: Mandate[];
  clearances: Clearance[];
  replays: Map<string, { status: number; body: JsonBodyType }>;
  seq: { plan: number; clearance: number };
}
const holder = globalThis as typeof globalThis & { __gpMockJuristic?: Map<string, JuristicStore> };
holder.__gpMockJuristic ??= new Map();
const stores = holder.__gpMockJuristic;

const OPEN = new Set(["issued", "partially_paid", "overdue"]);

/** Whole satang of a decimal string — the mock engine's bookkeeping (the app never does this). */
function satang(amount: string): number {
  const negative = amount.startsWith("-");
  const [baht = "0", part = ""] = amount.replace("-", "").split(".");
  const value = Number(baht) * 100 + Number(part.padEnd(2, "0").slice(0, 2));
  return negative ? -value : value;
}
function money(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function has(account: MockAccount, word: string): boolean {
  return account.subject.toLowerCase().includes(word);
}

function openOf(account: MockAccount, unitId: string): MockInvoice[] {
  return billingOf(account).invoices.filter((i) => i.unitId === unitId && OPEN.has(i.dto.status));
}

function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1 + months, d)).toISOString().slice(0, 10);
}

function firstOfNextMonth(now = Date.now()): string {
  return addMonths(`${bangkokDate(now).slice(0, 7)}-01`, 1);
}

function storeOf(account: MockAccount): JuristicStore {
  const existing = stores.get(account.userId);
  if (existing) return existing;
  const store: JuristicStore = {
    plans: [],
    mandates: [],
    clearances: [],
    replays: new Map(),
    seq: { plan: 0, clearance: 0 },
  };
  stores.set(account.userId, store);
  const units = myUnitsOf(account).filter((u) => u.roles.some((r) => r.source === "ownership"));
  for (const unit of units) {
    const partyId = unit.roles[0]!.partyId;
    if (has(account, "planactive")) {
      const first = addMonths(firstOfNextMonth(), -1);
      store.plans.push({
        id: crypto.randomUUID(),
        unitId: unit.unitId,
        unitNo: unit.unitNo,
        partyId,
        partyName: account.displayName,
        state: "active",
        proposedBy: "resident",
        instalmentCount: 3,
        firstDueOn: first,
        proposedPrincipal: "6375.00",
        principal: "6375.00",
        invoiceIds: [],
        creditNoteIds: [crypto.randomUUID()],
        defaultAfterDays: 30,
        note: null,
        decidedReason: null,
        approvedAt: bangkokIso(Date.now() - 20 * DAY),
        endedAt: null,
        acceleratedChargeId: null,
        instalments: [0, 1, 2].map((i) => ({
          seq: i + 1,
          dueOn: addMonths(first, i),
          amount: "2125.00",
          state: i === 0 ? "paid" : i === 1 ? "billed" : "scheduled",
          invoiceChargeId: i < 2 ? crypto.randomUUID() : null,
          paidAt: i === 0 ? bangkokIso(Date.parse(`${first}T10:00:00+07:00`)) : null,
        })),
        nextActions: [],
        createdAt: bangkokIso(Date.now() - 25 * DAY),
        version: 2,
      });
    }
    if (has(account, "autopay")) {
      store.mandates.push({
        id: crypto.randomUUID(),
        unitId: unit.unitId,
        unitNo: unit.unitNo,
        partyId,
        method: "direct_debit",
        provider: "fake",
        scope: "advance_invoices",
        state: "active",
        masked: "xxx-x-x5678-x",
        activatedAt: bangkokIso(Date.now() - 40 * DAY),
        createdAt: bangkokIso(Date.now() - 40 * DAY),
        endedAt: null,
        endReason: null,
      });
    }
  }
  return store;
}

export function forgetJuristic(account: MockAccount): void {
  stores.delete(account.userId);
}

type UnitCheck = { unit: ReturnType<typeof myUnitsOf>[number]; partyId: string };

/** The unit as one of mine that is billed to me (`invoices` capability), else the operation's 404. */
function billedUnit(account: MockAccount, unitId: string, op: string): UnitCheck | Response {
  const unit = myUnitsOf(account).find((u) => u.unitId === unitId);
  if (!unit || !unit.capabilities.includes("invoices")) return problem(op, "http.not_found");
  return { unit, partyId: unit.roles[0]!.partyId };
}

/** Idempotent replay by `Idempotency-Key` (the API stores the first answer for 24 h). */
function replayed(store: JuristicStore, request: Request, scope: string): Response | null {
  const key = request.headers.get("idempotency-key");
  const hit = key ? store.replays.get(`${scope}|${key}`) : undefined;
  return hit ? HttpResponse.json(hit.body, { status: hit.status }) : null;
}
function remember(store: JuristicStore, request: Request, scope: string, status: number, body: JsonBodyType): Response {
  const key = request.headers.get("idempotency-key");
  if (key) store.replays.set(`${scope}|${key}`, { status, body });
  return HttpResponse.json(body, { status });
}

function documentLink(kind: string, id: string, number: string): Schemas["DocumentDownloadDto"] {
  return {
    documentId: crypto.randomUUID(),
    number,
    url: `/bff/v1/resident/__mock/documents/${kind}/${id}.pdf`,
    expiresAt: bangkokIso(Date.now() + 5 * 60_000),
  };
}

/** Statements (J1.2b, D-307): this month's with what is open now, and last month's settled one. */
function statementsOf(account: MockAccount): Schemas["StatementDto"][] {
  const owned = myUnitsOf(account).filter((u) => u.roles.some((r) => r.source === "ownership"));
  if (owned.length === 0) return [];
  const billing = billingOf(account);
  const now = Date.now();
  const thisMonth = bangkokDate(now).slice(0, 7);
  const lastMonth = addMonths(`${thisMonth}-01`, -1).slice(0, 7);
  const open = billing.invoices.filter((i) => owned.some((u) => u.unitId === i.unitId) && OPEN.has(i.dto.status));
  const due = open.reduce((sum, i) => sum + satang(i.dto.balance), 0);
  const charged = open.reduce((sum, i) => sum + satang(i.dto.total), 0);
  const units = owned.map((u) => ({ id: u.unitId, unitNo: u.unitNo, building: u.buildingName }));
  const party = owned[0]!.roles[0]!.partyId;
  const base = {
    partyId: party,
    partyName: account.displayName,
    language: "th" as const,
    deliveredVia: ["line"],
    letterBatchId: null,
    paymentIds: [],
    units,
  };
  const end = (month: string) => {
    const [y, m] = month.split("-").map(Number) as [number, number];
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  };
  return [
    {
      ...base,
      id: statementId(account, thisMonth),
      number: `STM-${thisMonth.replace("-", "")}-00012`,
      period: thisMonth,
      periodStart: `${thisMonth}-01`,
      periodEnd: end(thisMonth),
      issuedAt: bangkokIso(Date.parse(`${thisMonth}-01T08:00:00+07:00`)),
      documentId: has(account, "stmpending") ? null : crypto.randomUUID(),
      opening: "0.00",
      charges: money(charged),
      credits: "0.00",
      payments: "0.00",
      closing: money(charged),
      amountDue: money(due),
      openInvoices: open.map((i) => ({
        id: i.dto.id,
        number: i.dto.number,
        unitNo: i.dto.unitNo,
        periodStart: i.dto.periodStart,
        periodEnd: i.dto.periodEnd,
        dueDate: i.dto.dueDate,
        balance: i.dto.balance,
      })),
    },
    {
      ...base,
      id: statementId(account, lastMonth),
      number: `STM-${lastMonth.replace("-", "")}-00011`,
      period: lastMonth,
      periodStart: `${lastMonth}-01`,
      periodEnd: end(lastMonth),
      issuedAt: bangkokIso(Date.parse(`${lastMonth}-01T08:00:00+07:00`)),
      documentId: crypto.randomUUID(),
      opening: "2125.00",
      charges: "0.00",
      credits: "0.00",
      payments: "2125.00",
      closing: "0.00",
      amountDue: "0.00",
      openInvoices: [],
    },
  ];
}

/** Stable statement ids per account and month, so a measured URL (`/statements/<id>`) does not change. */
export function statementId(account: Pick<MockAccount, "subject">, month: string): string {
  let hash = 0;
  for (const char of `${account.subject}#statement#${month}`) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const hex = hash.toString(16).padStart(8, "0");
  return `${hex}-5a7e-4c1d-8e2f-${month.replace("-", "").padEnd(12, "0")}`;
}

function budgetOf(account: MockAccount, buildingId: string): Schemas["BudgetActualIncomeDto"] {
  const year = Number(bangkokDate(Date.now()).slice(0, 4));
  const village = has(account, "village");
  return {
    budgetId: crypto.randomUUID(),
    buildingId,
    fiscalYear: year,
    periodStart: `${year}-01-01`,
    periodEnd: `${year}-12-31`,
    asOf: bangkokDate(Date.now()),
    budgetedIncome: village ? "5580000.00" : "10200000.00",
    billed: village ? "4370000.00" : "7854000.00",
    billedVsBudgetPct: village ? "78.32" : "77.00",
    collected: village ? "4012000.00" : "7400000.00",
    collectedVsBilledPct: village ? "91.81" : "94.22",
    billedByKind: [
      { kind: "common_fee", amount: village ? "3933000.00" : "7068600.00" },
      { kind: "fund", amount: village ? "437000.00" : "785400.00" },
    ],
    incomeLines: [
      { label: "ค่าส่วนกลาง", amount: village ? "5022000.00" : "9180000.00" },
      { label: "เงินกองทุน", amount: village ? "558000.00" : "1020000.00" },
    ],
    expenseSideAvailable: false,
  };
}

export const juristicHandlers: HttpHandler[] = [
  http.get(mswPath("/v1/resident/statements"), ({ request }) => {
    const op = "resident.statements.list";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const all = statementsOf(auth.account);
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("perPage") ?? 25)));
    return HttpResponse.json({
      data: all.slice((page - 1) * perPage, page * perPage),
      meta: { page, perPage, total: all.length },
    });
  }),

  http.get(mswPath("/v1/resident/statements/:statementId/document"), ({ request, params }) => {
    const op = "resident.statements.document";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const statement = statementsOf(auth.account).find((s) => s.id === params.statementId);
    if (!statement) return problem(op, "http.not_found");
    if (!statement.documentId) return problem(op, "statement.document_pending");
    return HttpResponse.json(documentLink("statements", statement.id, statement.number));
  }),

  http.get(mswPath("/v1/resident/units/:unitId/budget-vs-actual"), ({ request, params }) => {
    const op = "resident.units.budgetVsActual";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unit = myUnitsOf(auth.account).find((u) => u.unitId === params.unitId);
    // An approved budget exists only for the juristic buildings of the mock (not the rented A-201 / B-105).
    if (!unit || unit.legalForm === null || has(auth.account, "nobudget")) return problem(op, "http.not_found");
    return HttpResponse.json(budgetOf(auth.account, unit.buildingId));
  }),

  http.get(mswPath("/v1/resident/units/:unitId/payment-plans"), ({ request, params }) => {
    const op = "resident.units.paymentPlans";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = billedUnit(auth.account, String(params.unitId), op);
    if (found instanceof Response) return found;
    const store = storeOf(auth.account);
    return HttpResponse.json(store.plans.filter((p) => p.unitId === found.unit.unitId).reverse());
  }),

  http.post(mswPath("/v1/resident/units/:unitId/payment-plan-requests"), async ({ request, params }) => {
    const op = "resident.units.requestPaymentPlan";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = billedUnit(auth.account, String(params.unitId), op);
    if (found instanceof Response) return found;
    const store = storeOf(auth.account);
    const again = replayed(store, request, `plan|${found.unit.unitId}`);
    if (again) return again;
    const body = (await request.json().catch(() => ({}))) as Partial<Schemas["PaymentPlanRequestDto"]>;
    const n = body.instalments;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 2 || n > PLAN_MAX_INSTALMENTS) {
      return problem(op, "validation.failed", {
        errors: [
          {
            path: "instalments",
            code: typeof n === "number" && n > PLAN_MAX_INSTALMENTS ? "max" : "min",
            message: `ผ่อนได้ 2–${PLAN_MAX_INSTALMENTS} งวด`,
          },
        ],
      });
    }
    const latest = addMonths(bangkokDate(Date.now()), 3);
    if (body.firstDueOn && (body.firstDueOn > latest || body.firstDueOn <= bangkokDate(Date.now()))) {
      return problem(op, "validation.failed", {
        errors: [{ path: "firstDueOn", code: "max", message: "งวดแรกต้องอยู่ภายใน 3 เดือนนับจากวันนี้" }],
      });
    }
    if (store.plans.some((p) => p.unitId === found.unit.unitId && (p.state === "proposed" || p.state === "active"))) {
      return problem(op, "payment_plan.open_exists");
    }
    const open = openOf(auth.account, found.unit.unitId);
    if (open.length === 0) return problem(op, "payment_plan.nothing_due");
    const principal = open.reduce((sum, i) => sum + satang(i.dto.balance), 0);
    const each = Math.floor(principal / n);
    const first = body.firstDueOn ?? firstOfNextMonth();
    store.seq.plan += 1;
    const plan: Plan = {
      id: crypto.randomUUID(),
      unitId: found.unit.unitId,
      unitNo: found.unit.unitNo,
      partyId: found.partyId,
      partyName: auth.account.displayName,
      state: "proposed",
      proposedBy: "resident",
      instalmentCount: n,
      firstDueOn: first,
      proposedPrincipal: money(principal),
      principal: null,
      invoiceIds: open.map((i) => i.dto.id),
      creditNoteIds: [],
      defaultAfterDays: null,
      note: body.note?.trim() || null,
      decidedReason: null,
      approvedAt: null,
      endedAt: null,
      acceleratedChargeId: null,
      instalments: Array.from({ length: n }, (_, i) => ({
        seq: i + 1,
        dueOn: addMonths(first, i),
        amount: money(i === n - 1 ? principal - each * (n - 1) : each),
        state: "scheduled" as const,
        invoiceChargeId: null,
        paidAt: null,
      })),
      nextActions: ["withdraw"],
      createdAt: bangkokIso(Date.now()),
      version: 1,
    };
    store.plans.push(plan);
    return remember(store, request, `plan|${found.unit.unitId}`, 201, plan);
  }),

  http.post(mswPath("/v1/resident/units/:unitId/payment-plans/:planId/actions/withdraw"), ({ request, params }) => {
    const op = "resident.units.withdrawPaymentPlan";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = billedUnit(auth.account, String(params.unitId), op);
    if (found instanceof Response) return found;
    const plan = storeOf(auth.account).plans.find((p) => p.id === params.planId && p.unitId === found.unit.unitId);
    if (!plan) return problem(op, "http.not_found");
    if (plan.state !== "proposed") return problem(op, "payment_plan.invalid_state");
    Object.assign(plan, {
      state: "cancelled",
      endedAt: bangkokIso(Date.now()),
      nextActions: [],
      instalments: plan.instalments.map((i) => ({ ...i, state: "cancelled" })),
      version: plan.version + 1,
    });
    return HttpResponse.json(plan);
  }),

  http.post(mswPath("/v1/resident/__mock/units/:unitId/payment-plans/:planId/approve"), ({ request, params }) => {
    const auth = authenticate(request, "resident", "resident.units.paymentPlans");
    if (auth instanceof Response) return auth;
    const plan = storeOf(auth.account).plans.find((p) => p.id === params.planId && p.unitId === params.unitId);
    if (!plan || plan.state !== "proposed") return new HttpResponse(null, { status: 409 });
    Object.assign(plan, {
      state: "active",
      principal: plan.proposedPrincipal,
      approvedAt: bangkokIso(Date.now()),
      defaultAfterDays: 30,
      nextActions: [],
      version: plan.version + 1,
    });
    return HttpResponse.json(plan);
  }),

  http.get(mswPath("/v1/resident/units/:unitId/payment-mandates"), ({ request, params }) => {
    const op = "resident.units.paymentMandates";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = billedUnit(auth.account, String(params.unitId), op);
    if (found instanceof Response) return found;
    return HttpResponse.json(
      storeOf(auth.account)
        .mandates.filter((m) => m.unitId === found.unit.unitId)
        .reverse(),
    );
  }),

  http.post(mswPath("/v1/resident/units/:unitId/payment-mandates"), async ({ request, params }) => {
    const op = "resident.units.createPaymentMandate";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = billedUnit(auth.account, String(params.unitId), op);
    if (found instanceof Response) return found;
    const store = storeOf(auth.account);
    const again = replayed(store, request, `mandate|${found.unit.unitId}`);
    if (again) return again;
    if (has(auth.account, "recurringoff")) return problem(op, "recurring.unavailable");
    const body = (await request.json().catch(() => ({}))) as Partial<Schemas["PaymentMandateCreateDto"]>;
    if (body.method !== "direct_debit" && body.method !== "card_token") {
      return problem(op, "validation.failed", {
        errors: [{ path: "method", code: "isEnum", message: "method must be direct_debit or card_token" }],
      });
    }
    if (store.mandates.some((m) => m.unitId === found.unit.unitId && (m.state === "pending" || m.state === "active"))) {
      return problem(op, "payment_mandate.open_exists");
    }
    const mandate: Mandate = {
      id: crypto.randomUUID(),
      unitId: found.unit.unitId,
      unitNo: found.unit.unitNo,
      partyId: found.partyId,
      method: body.method,
      provider: "fake",
      scope: body.scope ?? "advance_invoices",
      state: "pending",
      masked: null,
      activatedAt: null,
      createdAt: bangkokIso(Date.now()),
      endedAt: null,
      endReason: null,
    };
    store.mandates.push(mandate);
    return remember(store, request, `mandate|${found.unit.unitId}`, 201, {
      mandate,
      setupUrl: `/bff/v1/resident/__mock/recurring/setup/${mandate.id}`,
    } satisfies Schemas["PaymentMandateCreatedDto"]);
  }),

  http.get(mswPath("/v1/resident/__mock/recurring/setup/:mandateId"), ({ params }) => {
    for (const store of stores.values()) {
      const mandate = store.mandates.find((m) => m.id === params.mandateId);
      if (mandate && mandate.state === "pending") {
        Object.assign(mandate, {
          state: "active",
          activatedAt: bangkokIso(Date.now()),
          masked: mandate.method === "card_token" ? "•••• 4242" : "xxx-x-x5678-x",
        });
      }
    }
    return new HttpResponse("<!doctype html><title>mock provider</title><p>Authorised (mock provider).</p>", {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }),

  http.post(mswPath("/v1/resident/units/:unitId/payment-mandates/:mandateId/actions/cancel"), ({ request, params }) => {
    const op = "resident.units.cancelPaymentMandate";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = billedUnit(auth.account, String(params.unitId), op);
    if (found instanceof Response) return found;
    const mandate = storeOf(auth.account).mandates.find(
      (m) => m.id === params.mandateId && m.unitId === found.unit.unitId,
    );
    if (!mandate) return problem(op, "http.not_found");
    if (mandate.state !== "pending" && mandate.state !== "active") return problem(op, "payment_mandate.invalid_state");
    Object.assign(mandate, { state: "revoked", endedAt: bangkokIso(Date.now()), endReason: "resident" });
    return HttpResponse.json(mandate);
  }),

  http.get(mswPath("/v1/resident/units/:unitId/debt-clearances"), ({ request, params }) => {
    const op = "resident.units.debtClearances";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = billedUnit(auth.account, String(params.unitId), op);
    if (found instanceof Response) return found;
    return HttpResponse.json(
      storeOf(auth.account)
        .clearances.filter((c) => c.unitId === found.unit.unitId)
        .map((c) => ({ ...c, verifyCode: null }))
        .reverse(),
    );
  }),

  http.post(mswPath("/v1/resident/units/:unitId/debt-clearance-requests"), async ({ request, params }) => {
    const op = "resident.units.requestDebtClearance";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = billedUnit(auth.account, String(params.unitId), op);
    if (found instanceof Response) return found;
    // Co-owners only (D-306): a payer or lessee of the unit cannot ask for the owner's certificate.
    if (!found.unit.roles.some((r) => r.role === "co_owner")) return problem(op, "auth.forbidden");
    const store = storeOf(auth.account);
    const again = replayed(store, request, `clearance|${found.unit.unitId}`);
    if (again) return again;
    const body = (await request.json().catch(() => ({}))) as Partial<Schemas["DebtClearanceRequestDto"]>;
    const today = bangkokDate(Date.now());
    const asOf = body.asOf ?? today;
    if (asOf < today || asOf > bangkokDate(Date.now() + 60 * DAY)) {
      return problem(op, "validation.failed", {
        errors: [{ path: "asOf", code: "max", message: "วันที่ต้องอยู่ระหว่างวันนี้ถึง 60 วันข้างหน้า" }],
      });
    }
    const outstanding = openOf(auth.account, found.unit.unitId).reduce((sum, i) => sum + satang(i.dto.balance), 0);
    if (outstanding > 0) return problem(op, "debt_clearance.outstanding", { outstanding: money(outstanding) });
    store.seq.clearance += 1;
    const fee = has(auth.account, "clearancefee");
    const code = `GPV${String(store.seq.clearance).padStart(3, "0")}K7Q2`;
    const clearance: Clearance = {
      id: crypto.randomUUID(),
      unitId: found.unit.unitId,
      unitNo: found.unit.unitNo,
      partyId: found.partyId,
      partyName: auth.account.displayName,
      asOf,
      language: body.language ?? "th",
      requestedVia: "liff",
      fee: fee ? "500.00" : "0.00",
      state: fee ? "requested" : "issued",
      number: fee ? null : `DCL-${today.slice(0, 4)}-${String(store.seq.clearance).padStart(5, "0")}`,
      documentId: fee ? null : crypto.randomUUID(),
      issuedAt: fee ? null : bangkokIso(Date.now()),
      validUntil: fee ? null : bangkokDate(Date.parse(`${asOf}T12:00:00+07:00`) + CLEARANCE_VALIDITY_DAYS * DAY),
      verifyCode: fee ? null : code,
      verifyCodeHint: fee ? null : code.slice(-4),
      refuseReason: null,
      nextActions: [],
      createdAt: bangkokIso(Date.now()),
    };
    store.clearances.push({ ...clearance, verifyCode: null });
    return remember(store, request, `clearance|${found.unit.unitId}`, 201, clearance);
  }),

  http.get(mswPath("/v1/resident/units/:unitId/debt-clearances/:debtClearanceId/document"), ({ request, params }) => {
    const op = "resident.units.debtClearanceDocument";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = billedUnit(auth.account, String(params.unitId), op);
    if (found instanceof Response) return found;
    const clearance = storeOf(auth.account).clearances.find(
      (c) => c.id === params.debtClearanceId && c.unitId === found.unit.unitId,
    );
    if (!clearance || !clearance.number) return problem(op, "http.not_found");
    return HttpResponse.json(documentLink("debt-clearances", clearance.id, clearance.number));
  }),
];
