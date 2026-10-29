import type { Schemas } from "@/lib/api/types";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconHide } from "@/ui/icons/glyphs/hide";
import { IconHistory } from "@/ui/icons/glyphs/history";
import { IconSearch } from "@/ui/icons/glyphs/search";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { defineStatuses } from "./index";

/**
 * `BuildingReviewState` of my review of a building (GL4, api G9, D-301) — liff-owned. Reviews are pre-moderated while
 * `review.moderation.premoderate` is on (O-035): a new one waits for the getproperty team.
 */
export type ReviewState = Schemas["BuildingReviewState"];

export const REVIEW_STATUS = defineStatuses<ReviewState>("review", {
  pending_moderation: { tone: "warning", icon: IconClock },
  published: { tone: "success", icon: IconCheckCircle },
  rejected: { tone: "danger", icon: IconXCircle },
  hidden: { tone: "neutral", icon: IconHide },
  withdrawn: { tone: "neutral", icon: IconHistory },
});

/** `RelocationOfferState` of a relocation offer after my move-out notice (GL4, api G8, D-299) — liff-owned. */
export type RelocationState = Schemas["RelocationOfferState"];

export const RELOCATION_STATUS = defineStatuses<RelocationState>("relocation", {
  open: { tone: "primary", icon: IconSearch },
  dismissed: { tone: "neutral", icon: IconXCircle },
  withdrawn: { tone: "neutral", icon: IconHistory },
  closed: { tone: "neutral", icon: IconHistory },
});
