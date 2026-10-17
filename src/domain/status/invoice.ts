import type { ContractEnum } from "@/lib/api/types";

import { defineStatuses } from "./index";

/**
 * `InvoiceStatus` from the contract once B4.2 invoices publish it; until then the values of invoice_status (schema-design v2 `ops.invoice.status`). When the
 * generated type appears it replaces the fallback, and a value without a label, tone and icon fails the build.
 * Overdue is amber, never red: a bill that is late is a nudge, not an alarm (D-100).
 */
export type InvoiceStatus = ContractEnum<
  "InvoiceStatus",
  "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "void"
>;

export const INVOICE_STATUS = defineStatuses<InvoiceStatus>("invoice", {
  draft: { tone: "neutral", icon: "edit" },
  issued: { tone: "primary", icon: "bill" },
  partially_paid: { tone: "info", icon: "clock" },
  paid: { tone: "success", icon: "check-circle" },
  overdue: { tone: "warning", icon: "warning" },
  void: { tone: "neutral", icon: "x-circle" },
});
