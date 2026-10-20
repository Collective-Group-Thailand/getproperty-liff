import type { InvoiceLineView, InvoiceView } from "@/lib/api/types";
import type { InvoiceLineSourceType } from "@/lib/api/types";
import type { MeterUnit } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";

/**
 * Presentation of the API's invoices (L2 2.1): which are open, how urgent the due date is in words, how lines
 * group, how a meter unit and a price per unit read. Nothing here computes money — amounts are the API's
 * decimal strings and only ever formatted; dates are compared as Bangkok calendar days.
 */

const OPEN_STATUSES = new Set<InvoiceView["status"]>(["issued", "partially_paid", "overdue"]);

/** Still to pay: issued, partly paid or overdue (draft and void never reach a resident as payable). */
export function isOpen(invoice: Pick<InvoiceView, "status">): boolean {
  return OPEN_STATUSES.has(invoice.status);
}

/** `YYYY-MM-DD` of `now` in Bangkok. */
export function bangkokToday(now: number = Date.now()): string {
  return new Date(now + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Whole calendar days from `from` to `to` (both `YYYY-MM-DD`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export type DueState =
  | { kind: "paid" }
  | { kind: "void" }
  | { kind: "overdue"; days: number }
  | { kind: "today" }
  | { kind: "soon"; days: number }
  | { kind: "later"; days: number };

/** Days before the due date from which the hero turns amber (attention needed, D-100). */
export const DUE_SOON_DAYS = 3;

/**
 * The due date in words (D-100): paid and void say so; past the due date (or `overdue` from the API) is late;
 * today and the next {@link DUE_SOON_DAYS} days need attention; anything later is calm. The API's status wins
 * over the calendar: an invoice the API calls `overdue` is late even on its due date's evening.
 */
export function dueState(invoice: Pick<InvoiceView, "status" | "dueDate">, today: string): DueState {
  if (invoice.status === "paid") return { kind: "paid" };
  if (invoice.status === "void" || invoice.status === "draft") return { kind: "void" };
  const days = daysBetween(today, invoice.dueDate);
  if (invoice.status === "overdue" || days < 0) return { kind: "overdue", days: Math.max(1, -days) };
  if (days === 0) return { kind: "today" };
  if (days <= DUE_SOON_DAYS) return { kind: "soon", days };
  return { kind: "later", days };
}

/** Amber only when the resident should act now (D-100) — never red for a bill that is merely due. */
export function needsAttention(state: DueState): boolean {
  return state.kind === "overdue" || state.kind === "today" || state.kind === "soon";
}

/** Open invoices first, the one due soonest on top; then the rest in the API's order (newest first). */
export function openFirst<T extends Pick<InvoiceView, "status" | "dueDate">>(
  invoices: readonly T[],
): {
  open: T[];
  history: T[];
} {
  const open = invoices.filter(isOpen).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { open, history: invoices.filter((invoice) => !isOpen(invoice)) };
}

/** History grouped by the billing period's month (`YYYY-MM` of `periodStart`), in the order given. */
export function byPeriod<T extends Pick<InvoiceView, "periodStart">>(invoices: readonly T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const invoice of invoices) {
    const key = invoice.periodStart.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), invoice]);
  }
  return [...groups.entries()];
}

/** Line groups in the order a resident reads an invoice. */
export const LINE_GROUPS = [
  "rent",
  "meter",
  "service",
  "common_fee",
  "fund",
  "penalty",
  "deposit",
  "adjustment",
] as const satisfies readonly InvoiceLineSourceType[];
export type LineGroup = InvoiceLineSourceType;
/** Fails the build when the contract adds a source type that has no place in the reading order. */
const _everyGroupPlaced: Record<Exclude<InvoiceLineSourceType, (typeof LINE_GROUPS)[number]>, never> = {};
void _everyGroupPlaced;

/** The group a line is shown in: the API's `sourceType` (contract request #15, closed in getproperty-api F2). */
export function lineGroup(line: Pick<InvoiceLineView, "sourceType">): LineGroup {
  return line.sourceType;
}

/** The invoice's lines in reading order, grouped; empty groups are left out. */
export function groupLines<T extends Pick<InvoiceLineView, "sourceType" | "lineNo">>(
  lines: readonly T[],
): { group: LineGroup; lines: T[] }[] {
  return LINE_GROUPS.map((group) => ({
    group,
    lines: lines.filter((line) => lineGroup(line) === group).sort((a, b) => a.lineNo - b.lineNo),
  })).filter((entry) => entry.lines.length > 0);
}

/** A meter line: it has registers or a reading source (D-022). */
export function isMeterLine(line: Pick<InvoiceLineView, "registerFrom" | "registerTo" | "readingSource">): boolean {
  return line.registerFrom !== null || line.registerTo !== null || line.readingSource !== null;
}

/** The API's unit code (`kwh`, `m3`) as `formatUnits` takes it; `null` for anything that is not metered. */
export function meterUnit(unit: string | null): MeterUnit | null {
  const code = unit?.toLowerCase();
  if (code === "kwh") return "kWh";
  if (code === "m3" || code === "m³") return "m3";
  return null;
}

/**
 * A price per unit as the API sends it (4 decimals, `"7.0000"`) shown with two to four decimals
 * (`7.00`, `4.1825`) — trimmed as text, never rounded.
 */
export function formatRate(value: string, locale: Locale): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return "—";
  const [, sign, whole, fraction = ""] = match;
  const kept = fraction.replace(/0+$/, "").padEnd(2, "0").slice(0, 4);
  const grouped = new Intl.NumberFormat(locale === "th" ? "th-TH" : "en-GB").format(BigInt(whole!));
  return `${sign}${grouped}.${kept}`;
}

/** True when the API reported a money string of zero (`"0.00"`, `"-0.00"`) — a comparison of text, not a sum. */
export function isZero(amount: string): boolean {
  return /^-?0+(\.0+)?$/.test(amount.trim());
}
