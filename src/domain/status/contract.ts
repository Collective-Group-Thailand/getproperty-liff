import type { Schemas } from "@/lib/api/types";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconEdit } from "@/ui/icons/glyphs/edit";
import { IconHistory } from "@/ui/icons/glyphs/history";
import { IconSign } from "@/ui/icons/glyphs/sign";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/**
 * `ContractDocumentState` of a signable document of the contract library (GL3, D-294) — liff-owned. A resident only
 * ever gets `pending_signature` and `signed` (drafts and cancelled documents are never listed); the other values are
 * typed so a new backend value fails the build until it has a label.
 */
export type ContractState = Schemas["ContractDocumentState"];

export const CONTRACT_STATUS = defineStatuses<ContractState>("contract", {
  draft: { tone: "neutral", icon: IconEdit },
  pending_signature: { tone: "warning", icon: IconSign },
  signed: { tone: "success", icon: IconCheckCircle },
  cancelled: { tone: "neutral", icon: IconXCircle },
});

/** `RenewalOfferState` of a landlord's offer to renew (GL3, D-294) — liff-owned. */
export type RenewalState = Schemas["RenewalOfferState"];

export const RENEWAL_STATUS = defineStatuses<RenewalState>("renewal", {
  offered: { tone: "warning", icon: IconClock },
  accepted: { tone: "success", icon: IconCheckCircle },
  declined: { tone: "neutral", icon: IconXCircle },
  expired: { tone: "neutral", icon: IconHistory },
  withdrawn: { tone: "neutral", icon: IconXCircle },
});
