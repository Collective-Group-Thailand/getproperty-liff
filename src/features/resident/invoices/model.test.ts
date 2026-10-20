import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { GENERATED_OPERATIONS } from "../../../../mocks/generated/operations";
import type { InvoiceLineView, InvoiceView } from "@/lib/api/types";

import {
  bangkokToday,
  byPeriod,
  daysBetween,
  dueState,
  formatRate,
  groupLines,
  isMeterLine,
  isOpen,
  isZero,
  lineGroup,
  meterUnit,
  needsAttention,
  openFirst,
} from "./model";

/** The contract's own example of `GET /v1/resident/invoices/{invoiceId}` (B4.2). */
const example = structuredClone(
  GENERATED_OPERATIONS.find((op) => op.operationId === "resident.invoices.get")!.success.example,
) as InvoiceView;

/** A meter line from the contract's property examples of `ResidentInvoiceLineDto` (electricity, 120 kWh × 7.0000). */
const contract = JSON.parse(readFileSync(resolve(__dirname, "../../../../contract/openapi.json"), "utf8")) as {
  components: { schemas: Record<string, { properties: Record<string, { example?: unknown }> }> };
};
const meterExample = Object.fromEntries(
  Object.entries(contract.components.schemas.ResidentInvoiceLineDto!.properties).map(([key, property]) => [
    key,
    property.example ?? null,
  ]),
) as unknown as InvoiceLineView;

describe("invoice model on the contract examples (L2 2.1)", () => {
  it("places every line in a group, in reading order: rent first, the meter line under meters", () => {
    const lines = [
      { ...meterExample, lineNo: 9, lineKind: "electricity" as const, sourceType: "meter" as const },
      ...example.lines,
    ];
    const groups = groupLines(lines);
    expect(groups.flatMap((g) => g.lines)).toHaveLength(lines.length);
    for (const { group, lines: inGroup } of groups) for (const line of inGroup) expect(lineGroup(line)).toBe(group);
    expect(groups[0]!.group).toBe("rent");
    expect(groups.map((g) => g.group)).toContain("meter");
    expect(lines.filter(isMeterLine).every((line) => line.sourceType === "meter")).toBe(true);
    expect(isMeterLine(meterExample)).toBe(true);
    expect(meterUnit(meterExample.unit)).toBe("kWh");
    expect(formatRate(meterExample.unitPrice!, "th")).toBe("7.00");
  });

  it("keeps the example's money as the API's strings", () => {
    expect(example.total).toMatch(/^\d+\.\d{2}$/);
    expect(isOpen(example)).toBe(true);
    expect(isZero(example.priorBalance)).toBe(true);
    expect(isZero(example.balance)).toBe(false);
  });

  it("groups by the API's sourceType, whatever the line kind", () => {
    expect(lineGroup({ sourceType: "common_fee" })).toBe("common_fee");
    expect(lineGroup({ sourceType: "penalty" })).toBe("penalty");
  });
});

describe("due date in words (D-100)", () => {
  const today = "2026-11-10";
  const open = (dueDate: string, status: InvoiceView["status"] = "issued") => ({ status, dueDate });

  it("is calm when far, needs attention within three days and on the day, late after it", () => {
    expect(dueState(open("2026-11-20"), today)).toEqual({ kind: "later", days: 10 });
    expect(dueState(open("2026-11-13"), today)).toEqual({ kind: "soon", days: 3 });
    expect(dueState(open("2026-11-10"), today)).toEqual({ kind: "today" });
    expect(dueState(open("2026-11-07"), today)).toEqual({ kind: "overdue", days: 3 });
    expect(needsAttention({ kind: "later", days: 10 })).toBe(false);
    expect(needsAttention({ kind: "soon", days: 1 })).toBe(true);
    expect(needsAttention({ kind: "overdue", days: 1 })).toBe(true);
  });

  it("follows the API's status: overdue on the due date's evening, paid, void", () => {
    expect(dueState(open("2026-11-10", "overdue"), today)).toEqual({ kind: "overdue", days: 1 });
    expect(dueState(open("2026-11-01", "paid"), today)).toEqual({ kind: "paid" });
    expect(dueState(open("2026-11-01", "void"), today)).toEqual({ kind: "void" });
  });

  it("counts Bangkok calendar days", () => {
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    // 17:30 UTC is already the next day in Bangkok.
    expect(bangkokToday(Date.parse("2026-11-09T17:30:00Z"))).toBe("2026-11-10");
  });
});

describe("lists", () => {
  const inv = (id: string, status: InvoiceView["status"], dueDate: string, periodStart: string) =>
    ({ id, status, dueDate, periodStart }) as Pick<InvoiceView, "status" | "dueDate" | "periodStart"> & { id: string };

  it("puts open invoices first, the one due soonest on top; history keeps the API's order", () => {
    const { open, history } = openFirst([
      inv("a", "issued", "2026-11-20", "2026-10-01"),
      inv("b", "paid", "2026-10-05", "2026-09-01"),
      inv("c", "overdue", "2026-11-05", "2026-09-01"),
      inv("d", "void", "2026-09-05", "2026-08-01"),
    ]);
    expect(open.map((i) => i.id)).toEqual(["c", "a"]);
    expect(history.map((i) => i.id)).toEqual(["b", "d"]);
  });

  it("groups history by billing month", () => {
    const groups = byPeriod([
      inv("a", "paid", "2026-10-05", "2026-09-01"),
      inv("b", "paid", "2026-10-05", "2026-09-15"),
      inv("c", "paid", "2026-09-05", "2026-08-01"),
    ]);
    expect(groups.map(([period, items]) => [period, items.map((i) => i.id)])).toEqual([
      ["2026-09", ["a", "b"]],
      ["2026-08", ["c"]],
    ]);
  });
});

describe("formatting without arithmetic", () => {
  it("shows a price per unit with two to four decimals, trimmed as text", () => {
    expect(formatRate("7.0000", "th")).toBe("7.00");
    expect(formatRate("4.1825", "en")).toBe("4.1825");
    expect(formatRate("3.9900", "th")).toBe("3.99");
    expect(formatRate("1250.5000", "en")).toBe("1,250.50");
    expect(formatRate("abc", "th")).toBe("—");
  });

  it("maps the API's unit codes for formatUnits", () => {
    expect(meterUnit("kwh")).toBe("kWh");
    expect(meterUnit("m3")).toBe("m3");
    expect(meterUnit("month")).toBeNull();
    expect(meterUnit(null)).toBeNull();
  });

  it("recognises zero amounts as strings", () => {
    expect(isZero("0.00")).toBe(true);
    expect(isZero("-0.00")).toBe(true);
    expect(isZero("0.01")).toBe(false);
  });
});
