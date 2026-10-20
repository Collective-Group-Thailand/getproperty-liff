import type { ContractEnum } from "@/lib/api/types";
import { IconCheck } from "@/ui/icons/glyphs/check";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconStaff } from "@/ui/icons/glyphs/staff";
import { IconTicket } from "@/ui/icons/glyphs/ticket";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/**
 * `ServiceRequestStatus` — a contract enum since B5 (D-210, D-212); the fallback only types it when no contract is generated.
 * A value the contract adds fails the build until it has a label, a tone and an icon.
 * Waiting for parts is the only state that needs the resident's patience flagged.
 */
export type ServiceRequestStatus = ContractEnum<
  "ServiceRequestStatus",
  "new" | "triaged" | "assigned" | "in_progress" | "waiting_parts" | "done" | "closed" | "cancelled"
>;

export const SERVICE_REQUEST_STATUS = defineStatuses<ServiceRequestStatus>("serviceRequest", {
  new: { tone: "info", icon: IconTicket },
  triaged: { tone: "info", icon: IconCheck },
  assigned: { tone: "primary", icon: IconStaff },
  in_progress: { tone: "primary", icon: IconClock },
  waiting_parts: { tone: "warning", icon: IconClock },
  done: { tone: "success", icon: IconCheckCircle },
  closed: { tone: "neutral", icon: IconCheck },
  cancelled: { tone: "neutral", icon: IconXCircle },
});
