import type { Schemas } from "@/lib/api/types";
import { IconAlert } from "@/ui/icons/glyphs/alert";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconDot } from "@/ui/icons/glyphs/dot";
import { IconEdit } from "@/ui/icons/glyphs/edit";
import { IconSearch } from "@/ui/icons/glyphs/search";

import { defineStatuses } from "./index";

/**
 * `SettlementStatus` of a deposit settlement (D-023, contract `SettlementDto.status`) — liff-owned (L3). A proposed
 * settlement is the resident's call to action; a dispute is information, not an error.
 */
export type SettlementStatus = Schemas["SettlementStatus"];

export const SETTLEMENT_STATUS = defineStatuses<SettlementStatus>("settlement", {
  opened: { tone: "neutral", icon: IconClock },
  inspected: { tone: "info", icon: IconSearch },
  proposed: { tone: "primary", icon: IconEdit },
  agreed: { tone: "success", icon: IconCheckCircle },
  disputed: { tone: "warning", icon: IconAlert },
  refunded: { tone: "success", icon: IconCheckCircle },
  closed: { tone: "neutral", icon: IconDot },
});
