import type { ContractEnum } from "@/lib/api/types";

import { defineStatuses } from "./index";

/**
 * `ServiceRequestStatus` from the contract once B5 service requests (R2) publish it; until then the values of service_request_status (schema-design v2 `ops.service_request.status`). When the
 * generated type appears it replaces the fallback, and a value without a label, tone and icon fails the build.
 * Waiting for parts is the only state that needs the resident's patience flagged.
 */
export type ServiceRequestStatus = ContractEnum<
  "ServiceRequestStatus",
  "new" | "triaged" | "assigned" | "in_progress" | "waiting_parts" | "done" | "closed" | "cancelled"
>;

export const SERVICE_REQUEST_STATUS = defineStatuses<ServiceRequestStatus>("serviceRequest", {
  new: { tone: "info", icon: "ticket" },
  triaged: { tone: "info", icon: "check" },
  assigned: { tone: "primary", icon: "staff" },
  in_progress: { tone: "primary", icon: "clock" },
  waiting_parts: { tone: "warning", icon: "clock" },
  done: { tone: "success", icon: "check-circle" },
  closed: { tone: "neutral", icon: "check" },
  cancelled: { tone: "neutral", icon: "x-circle" },
});
