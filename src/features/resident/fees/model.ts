import { daysBetween, isOpen } from "@/features/resident/invoices/model";
import type { ApiError } from "@/lib/api/problem";
import type { InvoiceView, PropertyKind, Schemas } from "@/lib/api/types";

/**
 * JL1 — a co-owner's common fees, as the screens present the API's invoices (pure; unit-tested). Nothing here computes
 * money: amounts are the API's decimal strings and are only passed along. Periods are read from the invoice's own
 * `periodStart` / `periodEnd` (J1.1a: monthly `YYYY-MM`, quarterly `YYYY-Qn`, semiannual `YYYY-Hn`, annual `YYYY`,
 * calendar-aligned in Bangkok).
 */

export type PeriodKind = "year" | "half" | "quarter" | "month" | "range";

export interface FeePeriod {
  /** `2027`, `2027-H1`, `2027-Q3`, `2027-01`, or `<start>_<end>` for any other span. */
  key: string;
  kind: PeriodKind;
  year: number;
  /** Half (1–2), quarter (1–4) or month (1–12); absent for a year or a range. */
  n?: number;
  start: string;
  end: string;
}

function lastDayOf(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/** The period key of a billing span (J1.1a `parsePeriodKey`, read backwards from the dates). */
export function periodOf(start: string, end: string): FeePeriod {
  const [year, month, day] = start.split("-").map(Number) as [number, number, number];
  const span = (months: number) => day === 1 && end === lastDayOf(year, month - 1 + months);
  const pad = (value: number) => String(value).padStart(2, "0");
  if (month === 1 && span(12)) return { key: `${year}`, kind: "year", year, start, end };
  if ((month === 1 || month === 7) && span(6)) {
    const n = month === 1 ? 1 : 2;
    return { key: `${year}-H${n}`, kind: "half", year, n, start, end };
  }
  if ((month - 1) % 3 === 0 && span(3)) {
    const n = (month - 1) / 3 + 1;
    return { key: `${year}-Q${n}`, kind: "quarter", year, n, start, end };
  }
  if (span(1)) return { key: `${year}-${pad(month)}`, kind: "month", year, n: month, start, end };
  return { key: `${start}_${end}`, kind: "range", year, start, end };
}

const FEE_SOURCES = new Set<string>(["common_fee", "fund"]);

/** An invoice of the juristic office: it carries a common-fee or fund line (a lessee's rent never does). */
export function isFeeInvoice(invoice: Pick<InvoiceView, "lines">): boolean {
  return invoice.lines.some((line) => FEE_SOURCES.has(line.sourceType));
}

export interface FeeUnitBlock {
  unitId: string | null;
  unitNo: string;
  invoice: InvoiceView;
}

export interface FeeStatement {
  period: FeePeriod;
  /** One block per unit (one invoice each), in unit order. */
  units: FeeUnitBlock[];
  /** The soonest due date among the open invoices of the period (or the latest one when all are paid). */
  dueDate: string;
  open: boolean;
  /** The invoice the filled pay action pays: the open one due soonest. */
  payFirst: InvoiceView | null;
  /**
   * What the paper prints as its total: the API's balance when the period has one open invoice (or one invoice). Several
   * invoices would need a sum the browser must not compute — `null` until the API sends it (contract request #43).
   */
  total: string | null;
  /** The issuing juristic person(s) of the period. */
  issuers: string[];
}

/**
 * Statements as paper: the fee invoices grouped by billing period across my units — open periods first (soonest due
 * on top), then settled ones (newest first).
 */
export function groupStatements(invoices: readonly InvoiceView[]): FeeStatement[] {
  const groups = new Map<string, { period: FeePeriod; invoices: InvoiceView[] }>();
  for (const invoice of invoices) {
    if (!isFeeInvoice(invoice) || invoice.status === "void" || invoice.status === "draft") continue;
    const period = periodOf(invoice.periodStart, invoice.periodEnd);
    const group = groups.get(period.key) ?? { period, invoices: [] };
    group.invoices.push(invoice);
    groups.set(period.key, group);
  }
  const statements = [...groups.values()].map(({ period, invoices: list }) => {
    const units = [...list]
      .sort((a, b) => (a.unitNo ?? "").localeCompare(b.unitNo ?? "", "en", { numeric: true }))
      .map((invoice) => ({ unitId: invoice.unitId, unitNo: invoice.unitNo ?? "—", invoice }));
    // Soonest due first; on the same day, in unit order (the order of the paper).
    const openOnes = list
      .filter(isOpen)
      .sort(
        (a, b) =>
          a.dueDate.localeCompare(b.dueDate) || (a.unitNo ?? "").localeCompare(b.unitNo ?? "", "en", { numeric: true }),
      );
    const open = openOnes.length > 0;
    const dueDate = open
      ? openOnes[0]!.dueDate
      : [...list].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0]!.dueDate;
    const total = open
      ? openOnes.length === 1
        ? openOnes[0]!.balance
        : null
      : list.length === 1
        ? list[0]!.total
        : null;
    return {
      period,
      units,
      dueDate,
      open,
      payFirst: openOnes[0] ?? null,
      total,
      issuers: [...new Set(list.map((invoice) => invoice.issuerName))],
    } satisfies FeeStatement;
  });
  return statements.sort((a, b) =>
    a.open !== b.open
      ? a.open
        ? -1
        : 1
      : a.open
        ? a.dueDate.localeCompare(b.dueDate)
        : b.period.start.localeCompare(a.period.start),
  );
}

/** How the due line reads (J-DESIGN §3): muted; amber within 7 days; red only once the due date has passed. */
export type FeeDueTone =
  { tone: "paid" } | { tone: "muted"; days: number } | { tone: "amber"; days: number } | { tone: "red"; days: number };

/** Days before the due date from which the fees due line turns amber (J-DESIGN §3, liff-common-fees). */
export const FEE_SOON_DAYS = 7;

export function feeDueTone(statement: Pick<FeeStatement, "open" | "dueDate" | "payFirst">, today: string): FeeDueTone {
  if (!statement.open) return { tone: "paid" };
  const days = daysBetween(today, statement.dueDate);
  if (statement.payFirst?.status === "overdue" || days < 0) return { tone: "red", days: Math.max(1, -days) };
  if (days <= FEE_SOON_DAYS) return { tone: "amber", days };
  return { tone: "muted", days };
}

/**
 * The words of a place by its kind (J-DESIGN §1.3): i18n keys under `resident.fees.kind.*`, never `if (kind === …)`
 * in JSX. `null` (not set) reads as a room in a building.
 */
export interface KindWords {
  /** `resident.fees.kind.unit.<value>`: ห้องชุด, บ้าน, พื้นที่, ห้อง. */
  unit: "condo" | "house" | "space" | "room";
  /** `resident.fees.kind.size.<value>`: ตร.ม. or ตร.วา. */
  size: "sqm" | "sqwa";
  /** Whether a share of ownership (อัตราส่วนกรรมสิทธิ์) belongs to the place's vocabulary. */
  share: boolean;
}

const KIND_WORDS: Record<PropertyKind, KindWords> = {
  condo: { unit: "condo", size: "sqm", share: true },
  village: { unit: "house", size: "sqwa", share: false },
  community: { unit: "house", size: "sqwa", share: false },
  office: { unit: "space", size: "sqm", share: false },
  retail: { unit: "space", size: "sqm", share: false },
  industrial: { unit: "space", size: "sqm", share: false },
  apartment: { unit: "room", size: "sqm", share: false },
  mixed: { unit: "room", size: "sqm", share: false },
};

export function kindWords(kind: PropertyKind | null | undefined): KindWords {
  return kind ? KIND_WORDS[kind] : { unit: "room", size: "sqm", share: false };
}

/**
 * The register's measures of a unit as `ResidentMeUnitDto` carries them (CR #42, D-335): `areaSqm`, `ownershipRatio`
 * (the register's 6-decimal ratio — printed as returned, never converted to a percentage), `landAreaSqwa`, `plotNo`.
 */
export type UnitMeasures = Pick<Schemas["ResidentMeUnitDto"], "areaSqm" | "ownershipRatio" | "landAreaSqwa" | "plotNo">;

export function measuresOf(unit: Partial<UnitMeasures> | null | undefined): UnitMeasures {
  return {
    areaSqm: unit?.areaSqm ?? null,
    ownershipRatio: unit?.ownershipRatio ?? null,
    landAreaSqwa: unit?.landAreaSqwa ?? null,
    plotNo: unit?.plotNo ?? null,
  };
}

/** What the statement line prints under the unit tag: the size in the kind's unit and the share, when known. */
export function unitFacts(
  kind: PropertyKind | null | undefined,
  measures: UnitMeasures,
): { size: { value: string; unit: KindWords["size"] } | null; share: string | null; plot: string | null } {
  const words = kindWords(kind);
  const value = words.size === "sqwa" ? measures.landAreaSqwa : measures.areaSqm;
  return {
    size: value ? { value, unit: words.size } : null,
    share: words.share && measures.ownershipRatio ? measures.ownershipRatio : null,
    plot: measures.plotNo ?? null,
  };
}

/** Payment plan request (D-325) as typed by the resident. */
export interface PlanDraft {
  instalments: string;
  firstDueOn: string;
  note: string;
}

export type PlanDraftErrors = Partial<
  Record<"instalments" | "firstDueOn" | "note", "required" | "integer" | "min" | "max" | "past" | "late" | "tooLong">
>;

/** The contract's own lower bound (`PaymentPlanRequestDto.instalments.minimum`); the options may raise it. */
export const PLAN_MIN_INSTALMENTS = 2;

/** The office's limits for a request (`GET …/payment-plan-requests/options`, CR #45). */
export type PlanLimits = Pick<
  Schemas["PaymentPlanOptionsDto"],
  "minInstalments" | "maxInstalments" | "earliestFirstDueOn" | "latestFirstDueOn"
>;
export const PLAN_NOTE_MAX = 1000;

/**
 * Checks what the contract states (an integer ≥ 2, a first due date after today, a note ≤ 1000 characters) and, when
 * the options were read (CR #45), the office's range: `minInstalments` … `maxInstalments` and the first due date
 * within `earliestFirstDueOn` … `latestFirstDueOn`. Without them the API's 422 still answers at the field.
 */
export function validatePlanDraft(draft: PlanDraft, today: string, limits?: PlanLimits | null): PlanDraftErrors {
  const errors: PlanDraftErrors = {};
  const raw = draft.instalments.trim();
  const min = Math.max(PLAN_MIN_INSTALMENTS, limits?.minInstalments ?? PLAN_MIN_INSTALMENTS);
  if (!raw) errors.instalments = "required";
  else if (!/^\d+$/.test(raw)) errors.instalments = "integer";
  else if (Number(raw) < min) errors.instalments = "min";
  else if (limits && Number(raw) > limits.maxInstalments) errors.instalments = "max";
  if (draft.firstDueOn) {
    // The office's window when known (from today), else the conservative "after today".
    if (limits ? draft.firstDueOn < limits.earliestFirstDueOn : draft.firstDueOn <= today) {
      errors.firstDueOn = "past";
    } else if (limits && draft.firstDueOn > limits.latestFirstDueOn) errors.firstDueOn = "late";
  }
  if (draft.note.length > PLAN_NOTE_MAX) errors.note = "tooLong";
  return errors;
}

export function planBody(draft: PlanDraft): Schemas["PaymentPlanRequestDto"] {
  return {
    instalments: Number(draft.instalments.trim()),
    firstDueOn: draft.firstDueOn || null,
    note: draft.note.trim() || null,
  };
}

/** The plan that is still open on a unit (one at a time, `payment_plan.open_exists`). */
export function openPlan<T extends Pick<Schemas["PaymentPlanDto"], "state">>(plans: readonly T[]): T | undefined {
  return plans.find((plan) => plan.state === "proposed" || plan.state === "active");
}

/** The next instalment to pay (billed or scheduled), in sequence order. */
export function nextInstalment(
  plan: Pick<Schemas["PaymentPlanDto"], "instalments" | "state">,
): Schemas["PaymentPlanInstalmentDto"] | undefined {
  if (plan.state !== "active" && plan.state !== "proposed") return undefined;
  return [...plan.instalments]
    .sort((a, b) => a.seq - b.seq)
    .find((instalment) => instalment.state === "billed" || instalment.state === "scheduled");
}

/** A debt-clearance request's outcome, as the screen shows it. */
export type ClearanceOutcome =
  | { kind: "issued"; clearance: Schemas["DebtClearanceDto"] }
  | { kind: "requested"; clearance: Schemas["DebtClearanceDto"] }
  | { kind: "outstanding"; amount: string | null }
  | { kind: "problem"; error: ApiError };

/**
 * 201 → issued (or waiting for the office when the certificate has a fee); 409 `debt_clearance.outstanding` → the
 * refusal screen with the amount the API names (`outstanding`, nothing stored — pay first, then ask again).
 */
export function clearanceOutcome(
  result: { data: Schemas["DebtClearanceDto"] } | { error: ApiError },
): ClearanceOutcome {
  if ("data" in result) {
    return result.data.state === "issued"
      ? { kind: "issued", clearance: result.data }
      : { kind: "requested", clearance: result.data };
  }
  const { error } = result;
  if (error.code === "debt_clearance.outstanding") {
    const amount = error.problem.outstanding;
    return { kind: "outstanding", amount: typeof amount === "string" && /^-?\d+\.\d{2}$/.test(amount) ? amount : null };
  }
  return { kind: "problem", error };
}

/** Bill-to payers have `invoices` only (D-322): the debt-clearance certificate is a co-owner's (D-306). */
export function canRequestClearance(unit: Pick<Schemas["ResidentMeUnitDto"], "roles"> | null | undefined): boolean {
  return Boolean(unit?.roles.some((role) => role.role === "co_owner"));
}

/** A recurring mandate that is still in force (pending authorisation or active). */
export function liveMandate<T extends Pick<Schemas["PaymentMandateDto"], "state">>(
  mandates: readonly T[],
): T | undefined {
  return (
    mandates.find((mandate) => mandate.state === "active") ?? mandates.find((mandate) => mandate.state === "pending")
  );
}

/**
 * The thin budget bar's width: the API's `billedVsBudgetPct` (a percentage it computed), clamped to 0–100 for drawing.
 * `null` when the API sent none.
 */
export function barWidth(pct: string | null | undefined): number | null {
  if (!pct || !/^\d+(\.\d+)?$/.test(pct)) return null;
  const value = Number.parseFloat(pct);
  return Math.min(100, Math.max(0, value));
}

/** The year as the reader counts it: Buddhist era for Thai, Common Era otherwise (as `formatDate` does). */
export function eraYear(year: number, locale: string): number {
  return locale === "th" ? year + 543 : year;
}

/** The i18n key and values of a period's name: `period.year` "ปี 2570", `period.quarter` "ไตรมาส 2/2570" … */
export function periodWords(
  period: FeePeriod,
  locale: string,
): { key: string; values: Record<string, string | number> } {
  const year = eraYear(period.year, locale);
  switch (period.kind) {
    case "year":
      return { key: "period.year", values: { year } };
    case "half":
      return { key: "period.half", values: { year, n: period.n ?? 1 } };
    case "quarter":
      return { key: "period.quarter", values: { year, n: period.n ?? 1 } };
    case "month":
      return { key: "period.month", values: { month: `${period.year}-${String(period.n).padStart(2, "0")}` } };
    case "range":
      return { key: "period.range", values: { start: period.start, end: period.end } };
  }
}
