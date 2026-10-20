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
 * `WorkOrderStatus` — a contract enum since B5 (D-210, D-212); the fallback only types it when no contract is generated.
 * A value the contract adds fails the build until it has a label, a tone and an icon.
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
