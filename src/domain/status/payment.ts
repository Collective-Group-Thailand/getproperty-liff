import type { ContractEnum } from "@/lib/api/types";

import { defineStatuses } from "./index";

/**
 * `PaymentStatus` from the contract once B4.3 payments publish it; until then the values of payment_status (schema-design v2 `ops.payment.status`). When the
 * generated type appears it replaces the fallback, and a value without a label, tone and icon fails the build.
 * Pending is information, not a warning: the money is on its way and the receipt follows (D-011).
 */
export type PaymentStatus = ContractEnum<"PaymentStatus", "pending" | "confirmed" | "failed" | "refunded" | "reversed">;

export const PAYMENT_STATUS = defineStatuses<PaymentStatus>("payment", {
  pending: { tone: "info", icon: "clock" },
  confirmed: { tone: "success", icon: "check-circle" },
  failed: { tone: "danger", icon: "x-circle" },
  refunded: { tone: "neutral", icon: "refresh" },
  reversed: { tone: "warning", icon: "refresh" },
});
