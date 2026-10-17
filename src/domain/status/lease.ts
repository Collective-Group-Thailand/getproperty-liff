import type { ContractEnum } from "@/lib/api/types";
import { IconCalendar } from "@/ui/icons/glyphs/calendar";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconDot } from "@/ui/icons/glyphs/dot";
import { IconEdit } from "@/ui/icons/glyphs/edit";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

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
  draft: { tone: "neutral", icon: IconEdit },
  pending_signature: { tone: "primary", icon: IconEdit },
  active: { tone: "success", icon: IconCheckCircle },
  notice_given: { tone: "info", icon: IconCalendar },
  ending: { tone: "warning", icon: IconClock },
  ended: { tone: "neutral", icon: IconDot },
  terminated: { tone: "danger", icon: IconXCircle },
  cancelled: { tone: "neutral", icon: IconXCircle },
});
