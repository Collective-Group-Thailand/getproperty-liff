import type { Schemas } from "@/lib/api/types";
import { IconAlert } from "@/ui/icons/glyphs/alert";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconKey } from "@/ui/icons/glyphs/key";
import { IconLock } from "@/ui/icons/glyphs/lock";
import { IconTimer } from "@/ui/icons/glyphs/timer";
import { IconUnlock } from "@/ui/icons/glyphs/unlock";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/**
 * `CredentialStatus` of a door code (B5.2, D-070, D-071, D-211) — liff-owned (L4), with the tones and icons of
 * getproperty-web `7f6030b` `src/domain/status/credential.ts`.
 */
export type CredentialStatus = Schemas["CredentialStatus"];

export const CREDENTIAL_STATUS = defineStatuses<CredentialStatus>("credential", {
  pending: { tone: "neutral", icon: IconClock },
  active: { tone: "success", icon: IconKey },
  revoked: { tone: "neutral", icon: IconXCircle },
  expired: { tone: "neutral", icon: IconTimer },
  failed: { tone: "danger", icon: IconAlert },
});

/** `AccessResult` of an unlock in my unit's log (B5.2) — as getproperty-web `accessResult.ts`. */
export type AccessResult = Schemas["AccessResult"];

export const ACCESS_RESULT = defineStatuses<AccessResult>("accessResult", {
  success: { tone: "success", icon: IconUnlock },
  denied: { tone: "warning", icon: IconLock },
  error: { tone: "danger", icon: IconAlert },
});
