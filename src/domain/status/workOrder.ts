import type { ContractEnum } from "@/lib/api/types";
import { IconCheck } from "@/ui/icons/glyphs/check";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconShield } from "@/ui/icons/glyphs/shield";
import { IconStaff } from "@/ui/icons/glyphs/staff";
import { IconTicket } from "@/ui/icons/glyphs/ticket";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/**
 * `WorkOrderStatus` from the contract once B5 work orders (R2) publish it; until then the values of work_order_status (schema-design v2 `ops.work_order.status`). When the
 * generated type appears it replaces the fallback, and a value without a label, tone and icon fails the build.
 * The technician's own list (L4).
 */
export type WorkOrderStatus = ContractEnum<
  "WorkOrderStatus",
  "open" | "assigned" | "accepted" | "in_progress" | "done" | "verified" | "cancelled"
>;

export const WORK_ORDER_STATUS = defineStatuses<WorkOrderStatus>("workOrder", {
  open: { tone: "info", icon: IconTicket },
  assigned: { tone: "primary", icon: IconStaff },
  accepted: { tone: "primary", icon: IconCheck },
  in_progress: { tone: "primary", icon: IconClock },
  done: { tone: "success", icon: IconCheckCircle },
  verified: { tone: "success", icon: IconShield },
  cancelled: { tone: "neutral", icon: IconXCircle },
});
