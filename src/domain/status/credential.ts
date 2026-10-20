import type { Schemas } from "@/lib/api/types";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconHistory } from "@/ui/icons/glyphs/history";
import { IconWarning } from "@/ui/icons/glyphs/warning";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/**
 * `CredentialStatus` of a door code (D-070, D-071, D-211) — liff-owned (L4). A code still being sent to the lock is
 * information; one the vendor refused is a warning (the API retries), revoked and expired are neutral facts.
 */
export type CredentialStatus = Schemas["CredentialStatus"];

export const CREDENTIAL_STATUS = defineStatuses<CredentialStatus>("credential", {
  pending: { tone: "info", icon: IconClock },
  active: { tone: "success", icon: IconCheckCircle },
  revoked: { tone: "neutral", icon: IconXCircle },
  expired: { tone: "neutral", icon: IconHistory },
  failed: { tone: "warning", icon: IconWarning },
});

/** `AccessResult` of an unlock in my unit's log (D-070). */
export type AccessResult = Schemas["AccessResult"];

export const ACCESS_RESULT = defineStatuses<AccessResult>("accessResult", {
  success: { tone: "success", icon: IconCheckCircle },
  denied: { tone: "warning", icon: IconXCircle },
  error: { tone: "warning", icon: IconWarning },
});
