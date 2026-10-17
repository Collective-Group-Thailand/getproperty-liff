import type { Schemas } from "@/lib/api/types";
import { IconAlert } from "@/ui/icons/glyphs/alert";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconSearch } from "@/ui/icons/glyphs/search";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/**
 * `SlipStatus` of a transfer slip (D-043, D-198) — liff-owned (L2). Waiting for the check or for the office is
 * information; a duplicate is a warning (the same transfer pays once), never an accusation; only a rejection is
 * danger.
 */
export type SlipStatus = Schemas["SlipStatus"];

export const SLIP_STATUS = defineStatuses<SlipStatus>("slip", {
  pending_verification: { tone: "info", icon: IconClock },
  auto_confirmed: { tone: "success", icon: IconCheckCircle },
  pending_review: { tone: "info", icon: IconSearch },
  approved: { tone: "success", icon: IconCheckCircle },
  rejected: { tone: "danger", icon: IconXCircle },
  duplicate: { tone: "warning", icon: IconAlert },
});
