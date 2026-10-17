import type { ContractEnum } from "@/lib/api/types";
import { IconBill } from "@/ui/icons/glyphs/bill";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconEdit } from "@/ui/icons/glyphs/edit";
import { IconWarning } from "@/ui/icons/glyphs/warning";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

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
  draft: { tone: "neutral", icon: IconEdit },
  issued: { tone: "primary", icon: IconBill },
  partially_paid: { tone: "info", icon: IconClock },
  paid: { tone: "success", icon: IconCheckCircle },
  overdue: { tone: "warning", icon: IconWarning },
  void: { tone: "neutral", icon: IconXCircle },
});
