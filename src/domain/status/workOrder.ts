import type { ContractEnum } from "@/lib/api/types";

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
  open: { tone: "info", icon: "ticket" },
  assigned: { tone: "primary", icon: "staff" },
  accepted: { tone: "primary", icon: "check" },
  in_progress: { tone: "primary", icon: "clock" },
  done: { tone: "success", icon: "check-circle" },
  verified: { tone: "success", icon: "shield" },
  cancelled: { tone: "neutral", icon: "x-circle" },
});
