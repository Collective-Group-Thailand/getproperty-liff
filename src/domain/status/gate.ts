import type { Schemas } from "@/lib/api/types";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconHistory } from "@/ui/icons/glyphs/history";
import { IconLogIn } from "@/ui/icons/glyphs/log-in";
import { IconShieldAlert } from "@/ui/icons/glyphs/shield-alert";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/**
 * JL4 — visits at the gate, invites and SOS (api J4.1 / J4.2, D-315, D-317, D-327, D-328) — liff-owned. A waiting
 * visit is the one thing that needs the household now (amber); a refusal is a decision, not an alarm (neutral).
 */
export const VISIT_STATUS = defineStatuses<Schemas["VisitState"]>("visit", {
  requested: { tone: "warning", icon: IconClock },
  approved: { tone: "success", icon: IconCheckCircle },
  denied: { tone: "neutral", icon: IconXCircle },
  timed_out: { tone: "neutral", icon: IconHistory },
  entered: { tone: "info", icon: IconLogIn },
  exited: { tone: "neutral", icon: IconHistory },
  cancelled: { tone: "neutral", icon: IconXCircle },
});

export const INVITE_STATUS = defineStatuses<Schemas["VisitInviteState"]>("visitInvite", {
  pending_approval: { tone: "warning", icon: IconClock },
  active: { tone: "success", icon: IconCheckCircle },
  rejected: { tone: "neutral", icon: IconXCircle },
  revoked: { tone: "neutral", icon: IconHistory },
});

/** An SOS: open is the emergency itself (danger — the one place red belongs); acknowledged means help is coming. */
export const INCIDENT_STATUS = defineStatuses<Schemas["IncidentState"]>("incident", {
  open: { tone: "danger", icon: IconShieldAlert },
  acknowledged: { tone: "info", icon: IconCheckCircle },
  resolved: { tone: "success", icon: IconCheckCircle },
  cancelled: { tone: "neutral", icon: IconHistory },
});
