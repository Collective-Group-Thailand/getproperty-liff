import type { ContractEnum } from "@/lib/api/types";

import { defineStatuses } from "./index";

/**
 * `DepositStatus` from the contract once B2.4 deposits publish it; until then the values of deposit_status (schema-design v2 `ops.deposit.status`). When the
 * generated type appears it replaces the fallback, and a value without a label, tone and icon fails the build.
 * A deduction is shown as a warning with its reasons on the settlement, never as an error.
 */
export type DepositStatus = ContractEnum<
  "DepositStatus",
  "pending" | "held" | "settling" | "refunded" | "forfeited_partially" | "forfeited" | "disputed"
>;

export const DEPOSIT_STATUS = defineStatuses<DepositStatus>("deposit", {
  pending: { tone: "primary", icon: "clock" },
  held: { tone: "info", icon: "shield" },
  settling: { tone: "info", icon: "clock" },
  refunded: { tone: "success", icon: "check-circle" },
  forfeited_partially: { tone: "warning", icon: "warning" },
  forfeited: { tone: "warning", icon: "warning" },
  disputed: { tone: "danger", icon: "alert" },
});
