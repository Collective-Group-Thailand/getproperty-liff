import type { ContractEnum } from "@/lib/api/types";

import { defineStatuses } from "./index";

/**
 * `LeaseStatus` from the contract once B2.3 leases publish it; until then the values of lease_status (schema-design v2 `ops.lease.status`). When the
 * generated type appears it replaces the fallback, and a value without a label, tone and icon fails the build.
 * Pending signature is the resident's call to action (D-062).
 */
export type LeaseStatus = ContractEnum<
  "LeaseStatus",
  "draft" | "pending_signature" | "active" | "notice_given" | "ending" | "ended" | "terminated" | "cancelled"
>;

export const LEASE_STATUS = defineStatuses<LeaseStatus>("lease", {
  draft: { tone: "neutral", icon: "edit" },
  pending_signature: { tone: "primary", icon: "edit" },
  active: { tone: "success", icon: "check-circle" },
  notice_given: { tone: "info", icon: "calendar" },
  ending: { tone: "warning", icon: "clock" },
  ended: { tone: "neutral", icon: "dot" },
  terminated: { tone: "danger", icon: "x-circle" },
  cancelled: { tone: "neutral", icon: "x-circle" },
});
