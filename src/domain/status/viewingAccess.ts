import type { ContractEnum } from "@/lib/api/types";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconDoor } from "@/ui/icons/glyphs/door";
import { IconKey } from "@/ui/icons/glyphs/key";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/** `ViewingAccessState` — the door-code window of a self viewing, as the prospect reads it (GL2, D-295). */
export type ViewingAccessState = ContractEnum<
  "ViewingAccessState",
  "issued" | "entered" | "exited" | "expired" | "no_show" | "cancelled"
>;

export const VIEWING_ACCESS_STATUS = defineStatuses<ViewingAccessState>("viewingAccess", {
  issued: { tone: "info", icon: IconKey },
  entered: { tone: "primary", icon: IconDoor },
  exited: { tone: "success", icon: IconCheckCircle },
  expired: { tone: "neutral", icon: IconClock },
  no_show: { tone: "neutral", icon: IconXCircle },
  cancelled: { tone: "neutral", icon: IconXCircle },
});
