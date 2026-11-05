import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/problem";
import type { DebtClearance, InvoiceView } from "@/lib/api/types";

import {
  barWidth,
  canRequestClearance,
  clearanceOutcome,
  feeDueTone,
  groupStatements,
  isFeeInvoice,
  kindWords,
  liveMandate,
  measuresOf,
  nextInstalment,
  openPlan,
  periodOf,
  planBody,
  unitFacts,
  validatePlanDraft,
} from "./model";

function invoice(fields: Partial<InvoiceView> & { id: string }): InvoiceView {
  return {
    number: `CF-${fields.id}`,
    status: "issued",
    issuerName: "นิติบุคคลอาคารชุด ตัวอย่าง",
    unitId: `u-${fields.unitNo ?? "C-1203"}`,
    unitNo: "C-1203",
    periodStart: "2027-01-01",
    periodEnd: "2027-12-31",
    issuedAt: "2026-12-20T09:00:00+07:00",
    dueDate: "2027-01-31",
    isFinal: false,
    hasEstimate: false,
    total: "25500.00",
    amountDue: "25500.00",
    balance: "25500.00",
    priorBalance: "0.00",
    receipts: [],
    lines: [
      {
        lineNo: 1,
        lineKind: "common_fee",
        sourceType: "common_fee",
        description: "ค่าส่วนกลาง",
        amount: "22950.00",
        quantity: "1.000",
        unit: "year",
        unitPrice: null,
        units: null,
        periodFrom: null,
        periodTo: null,
        registerFrom: null,
        registerTo: null,
        readingSource: null,
        readAt: null,
        readingPhotoUrl: null,
        isEstimated: false,
        aboveCap: false,
      },
    ],
    ...fields,
  };
}

describe("periodOf (J1.1a period keys from the billing span)", () => {
  it("reads annual, semiannual, quarterly and monthly spans", () => {
    expect(periodOf("2027-01-01", "2027-12-31")).toMatchObject({ key: "2027", kind: "year" });
    expect(periodOf("2027-07-01", "2027-12-31")).toMatchObject({ key: "2027-H2", kind: "half", n: 2 });
    expect(periodOf("2027-01-01", "2027-06-30")).toMatchObject({ key: "2027-H1", kind: "half", n: 1 });
    expect(periodOf("2027-04-01", "2027-06-30")).toMatchObject({ key: "2027-Q2", kind: "quarter", n: 2 });
    expect(periodOf("2027-10-01", "2027-12-31")).toMatchObject({ key: "2027-Q4", kind: "quarter", n: 4 });
    expect(periodOf("2028-02-01", "2028-02-29")).toMatchObject({ key: "2028-02", kind: "month", n: 2 });
  });

  it("keeps a prorated or odd span as a range (a transfer inside the period)", () => {
    expect(periodOf("2027-03-15", "2027-12-31")).toMatchObject({ key: "2027-03-15_2027-12-31", kind: "range" });
    expect(periodOf("2027-02-01", "2027-03-31").kind).toBe("range");
  });
});

describe("groupStatements (statement as paper per period across units)", () => {
  const rent = invoice({
    id: "rent",
    lines: [{ ...invoice({ id: "x" }).lines[0]!, lineKind: "rent", sourceType: "rent" }],
  });

  it("keeps only the juristic office's fee invoices", () => {
    expect(isFeeInvoice(rent)).toBe(false);
    expect(groupStatements([rent])).toEqual([]);
  });

  it("groups two units' invoices of one period on one paper, in unit order", () => {
    const [statement] = groupStatements([
      invoice({ id: "b", unitNo: "C-1205", balance: "21000.00", total: "21000.00", dueDate: "2027-01-31" }),
      invoice({ id: "a", unitNo: "C-1203", dueDate: "2027-01-25" }),
    ]);
    expect(statement!.period.key).toBe("2027");
    expect(statement!.units.map((u) => u.unitNo)).toEqual(["C-1203", "C-1205"]);
    expect(statement!.dueDate).toBe("2027-01-25");
    expect(statement!.payFirst!.id).toBe("a");
    // Two invoices: the total would be a sum — never computed here (contract request #43).
    expect(statement!.total).toBeNull();
  });

  it("pays the first unit of the paper when two are due the same day", () => {
    const [statement] = groupStatements([
      invoice({ id: "b", unitNo: "C-1205" }),
      invoice({ id: "a", unitNo: "C-1203" }),
    ]);
    expect(statement!.payFirst!.unitNo).toBe("C-1203");
  });

  it("prints the API's balance as the total when the period has one open invoice", () => {
    const [statement] = groupStatements([invoice({ id: "a", balance: "12750.00" })]);
    expect(statement!.total).toBe("12750.00");
    expect(statement!.open).toBe(true);
  });

  it("puts open periods first (soonest due), then settled ones newest first", () => {
    const statements = groupStatements([
      invoice({ id: "p25", status: "paid", balance: "0.00", periodStart: "2025-01-01", periodEnd: "2025-12-31" }),
      invoice({ id: "p26", status: "paid", balance: "0.00", periodStart: "2026-01-01", periodEnd: "2026-12-31" }),
      invoice({ id: "q", periodStart: "2027-04-01", periodEnd: "2027-06-30", dueDate: "2027-04-30" }),
      invoice({ id: "y", dueDate: "2027-01-31" }),
    ]);
    expect(statements.map((s) => s.period.key)).toEqual(["2027", "2027-Q2", "2026", "2025"]);
    expect(statements[2]!.open).toBe(false);
    expect(statements[2]!.total).toBe("25500.00");
  });

  it("leaves void invoices out", () => {
    expect(groupStatements([invoice({ id: "v", status: "void" })])).toEqual([]);
  });
});

describe("feeDueTone (J-DESIGN §3: muted, amber within 7 days, red only after the due date)", () => {
  const due = (dueDate: string, status: InvoiceView["status"] = "issued") => {
    const [statement] = groupStatements([invoice({ id: "a", dueDate, status })]);
    return statement!;
  };

  it("is muted more than 7 days ahead", () => {
    expect(feeDueTone(due("2027-01-31"), "2027-01-10")).toEqual({ tone: "muted", days: 21 });
    expect(feeDueTone(due("2027-01-31"), "2027-01-23")).toEqual({ tone: "muted", days: 8 });
  });

  it("is amber from 7 days before up to the due date itself", () => {
    expect(feeDueTone(due("2027-01-31"), "2027-01-24")).toEqual({ tone: "amber", days: 7 });
    expect(feeDueTone(due("2027-01-31"), "2027-01-31")).toEqual({ tone: "amber", days: 0 });
  });

  it("is red only once the due date has passed (or the API says overdue)", () => {
    expect(feeDueTone(due("2027-01-31"), "2027-02-12")).toEqual({ tone: "red", days: 12 });
    expect(feeDueTone(due("2027-01-31", "overdue"), "2027-01-31")).toEqual({ tone: "red", days: 1 });
  });

  it("has no due line once paid", () => {
    expect(feeDueTone(due("2027-01-31", "paid"), "2027-02-12")).toEqual({ tone: "paid" });
  });
});

describe("kind vocabulary (J-DESIGN §1.3)", () => {
  it("names the place by its kind", () => {
    expect(kindWords("condo")).toEqual({ unit: "condo", size: "sqm", share: true });
    expect(kindWords("village")).toEqual({ unit: "house", size: "sqwa", share: false });
    expect(kindWords("community").unit).toBe("house");
    expect(kindWords("office")).toEqual({ unit: "space", size: "sqm", share: false });
    expect(kindWords("retail").unit).toBe("space");
    expect(kindWords("apartment").unit).toBe("room");
    expect(kindWords(null)).toEqual({ unit: "room", size: "sqm", share: false });
  });

  it("prints the size in the kind's unit and the share only for a condominium", () => {
    const condo = measuresOf({ areaSqm: "42.50", ownershipRatioPct: "0.3412" });
    expect(unitFacts("condo", condo)).toEqual({ size: { value: "42.50", unit: "sqm" }, share: "0.3412", plot: null });
    const plot = measuresOf({ landAreaSqwa: "62.50", plotNo: "B-14", areaSqm: "180.00" });
    expect(unitFacts("village", plot)).toEqual({ size: { value: "62.50", unit: "sqwa" }, share: null, plot: "B-14" });
    expect(unitFacts("condo", measuresOf({}))).toEqual({ size: null, share: null, plot: null });
    expect(measuresOf({ areaSqm: 42 })).toMatchObject({ areaSqm: null });
  });
});

describe("payment plan request validation", () => {
  const today = "2026-11-05";
  const draft = (fields: Partial<{ instalments: string; firstDueOn: string; note: string }>) => ({
    instalments: "3",
    firstDueOn: "",
    note: "",
    ...fields,
  });

  it("accepts an integer from the contract's minimum; the maximum is the API's", () => {
    expect(validatePlanDraft(draft({}), today)).toEqual({});
    expect(validatePlanDraft(draft({ instalments: "48" }), today)).toEqual({});
  });

  it("refuses an empty, a fractional and a too small number of instalments", () => {
    expect(validatePlanDraft(draft({ instalments: " " }), today).instalments).toBe("required");
    expect(validatePlanDraft(draft({ instalments: "2.5" }), today).instalments).toBe("integer");
    expect(validatePlanDraft(draft({ instalments: "-3" }), today).instalments).toBe("integer");
    expect(validatePlanDraft(draft({ instalments: "1" }), today).instalments).toBe("min");
  });

  it("refuses a first due date that is not after today, and a note over 1000 characters", () => {
    expect(validatePlanDraft(draft({ firstDueOn: "2026-11-05" }), today).firstDueOn).toBe("past");
    expect(validatePlanDraft(draft({ firstDueOn: "2026-12-01" }), today).firstDueOn).toBeUndefined();
    expect(validatePlanDraft(draft({ note: "x".repeat(1001) }), today).note).toBe("tooLong");
  });

  it("sends nulls for what was left empty", () => {
    expect(planBody(draft({ instalments: " 4 ", note: "  " }))).toEqual({
      instalments: 4,
      firstDueOn: null,
      note: null,
    });
  });

  it("knows the open plan and the next instalment", () => {
    const plans = [{ state: "cancelled" as const }, { state: "active" as const }];
    expect(openPlan(plans)).toBe(plans[1]);
    const next = nextInstalment({
      state: "active",
      instalments: [
        { seq: 2, dueOn: "2027-01-01", amount: "1.00", state: "billed", invoiceChargeId: null, paidAt: null },
        { seq: 1, dueOn: "2026-12-01", amount: "1.00", state: "paid", invoiceChargeId: null, paidAt: null },
      ],
    });
    expect(next?.seq).toBe(2);
    expect(nextInstalment({ state: "cancelled", instalments: [] })).toBeUndefined();
  });
});

describe("debt clearance outcome (outstanding refusal mapping)", () => {
  const clearance = { id: "c", state: "issued" } as unknown as DebtClearance;

  it("maps 409 debt_clearance.outstanding to the refusal with the API's amount", () => {
    const error = new ApiError(409, { code: "debt_clearance.outstanding", outstanding: "25500.00" });
    expect(clearanceOutcome({ error })).toEqual({ kind: "outstanding", amount: "25500.00" });
    const garbled = new ApiError(409, { code: "debt_clearance.outstanding", outstanding: 12 } as Record<
      string,
      unknown
    >);
    expect(clearanceOutcome({ error: garbled })).toEqual({ kind: "outstanding", amount: null });
  });

  it("issued at once, or waiting for the office when it has a fee", () => {
    expect(clearanceOutcome({ data: clearance }).kind).toBe("issued");
    expect(clearanceOutcome({ data: { ...clearance, state: "requested" } }).kind).toBe("requested");
  });

  it("keeps any other problem as it is", () => {
    const error = new ApiError(403, { code: "auth.forbidden" });
    expect(clearanceOutcome({ error })).toEqual({ kind: "problem", error });
  });

  it("is a co-owner's request only (a bill-to payer has invoices only)", () => {
    const role = (r: "co_owner" | "payer") => ({
      role: r,
      source: "ownership" as const,
      partyId: "p",
      leaseId: null,
      from: "2026-01-01",
      to: null,
    });
    expect(canRequestClearance({ roles: [role("co_owner")] })).toBe(true);
    expect(canRequestClearance({ roles: [role("payer")] })).toBe(false);
    expect(canRequestClearance(null)).toBe(false);
  });
});

describe("auto-pay and budget helpers", () => {
  it("finds the mandate in force", () => {
    expect(liveMandate([{ state: "revoked" as const }, { state: "pending" as const }])?.state).toBe("pending");
    expect(liveMandate([{ state: "failed" as const }])).toBeUndefined();
  });

  it("draws the API's percentage, clamped", () => {
    expect(barWidth("77.00")).toBe(77);
    expect(barWidth("104.5")).toBe(100);
    expect(barWidth(null)).toBeNull();
    expect(barWidth("n/a")).toBeNull();
  });
});
