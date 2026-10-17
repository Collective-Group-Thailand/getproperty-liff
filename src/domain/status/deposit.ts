import type { ContractEnum } from "@/lib/api/types";
import { IconAlert } from "@/ui/icons/glyphs/alert";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconShield } from "@/ui/icons/glyphs/shield";
import { IconWarning } from "@/ui/icons/glyphs/warning";

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
  pending: { tone: "primary", icon: IconClock },
  held: { tone: "info", icon: IconShield },
  settling: { tone: "info", icon: IconClock },
  refunded: { tone: "success", icon: IconCheckCircle },
  forfeited_partially: { tone: "warning", icon: IconWarning },
  forfeited: { tone: "warning", icon: IconWarning },
  disputed: { tone: "danger", icon: IconAlert },
});
