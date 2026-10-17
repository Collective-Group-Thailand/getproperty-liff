import type { Schemas } from "@/lib/api/types";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconDot } from "@/ui/icons/glyphs/dot";
import { IconInbox } from "@/ui/icons/glyphs/inbox";
import { IconShield } from "@/ui/icons/glyphs/shield";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/** `DsrState` of a PDPA data-subject request (D-025, PDPA s.30) — liff-owned (L3). */
export type DsrState = Schemas["DsrState"];

export const DSR_STATE = defineStatuses<DsrState>("dsr", {
  received: { tone: "primary", icon: IconInbox },
  verifying: { tone: "info", icon: IconShield },
  in_progress: { tone: "info", icon: IconClock },
  fulfilled: { tone: "success", icon: IconCheckCircle },
  rejected: { tone: "danger", icon: IconXCircle },
  withdrawn: { tone: "neutral", icon: IconDot },
});
