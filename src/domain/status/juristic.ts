import type { Schemas } from "@/lib/api/types";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconHistory } from "@/ui/icons/glyphs/history";
import { IconBill } from "@/ui/icons/glyphs/bill";
import { IconRefresh } from "@/ui/icons/glyphs/refresh";
import { IconRepeat } from "@/ui/icons/glyphs/repeat";
import { IconWarning } from "@/ui/icons/glyphs/warning";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/**
 * JL1 — a co-owner's arrangements with the juristic office (api J1.2a, D-306, D-308, D-325) — liff-owned. Firm, never
 * shaming (J-DESIGN §1.2): a plan that defaulted is a warning ("ยกเลิกการผ่อน"), never a red verdict on the person.
 */
export const PAYMENT_PLAN_STATUS = defineStatuses<Schemas["PaymentPlanState"]>("paymentPlan", {
  proposed: { tone: "warning", icon: IconClock },
  active: { tone: "primary", icon: IconRefresh },
  completed: { tone: "success", icon: IconCheckCircle },
  defaulted: { tone: "warning", icon: IconWarning },
  cancelled: { tone: "neutral", icon: IconHistory },
  rejected: { tone: "neutral", icon: IconXCircle },
});

export const INSTALMENT_STATUS = defineStatuses<Schemas["InstalmentState"]>("instalment", {
  scheduled: { tone: "neutral", icon: IconClock },
  billed: { tone: "info", icon: IconBill },
  paid: { tone: "success", icon: IconCheckCircle },
  cancelled: { tone: "neutral", icon: IconHistory },
});

export const MANDATE_STATUS = defineStatuses<Schemas["PaymentMandateState"]>("mandate", {
  pending: { tone: "warning", icon: IconClock },
  active: { tone: "success", icon: IconRepeat },
  revoked: { tone: "neutral", icon: IconHistory },
  failed: { tone: "warning", icon: IconWarning },
});

export const CLEARANCE_STATUS = defineStatuses<Schemas["DebtClearanceState"]>("clearance", {
  requested: { tone: "warning", icon: IconClock },
  issued: { tone: "success", icon: IconCheckCircle },
  refused: { tone: "neutral", icon: IconXCircle },
});
