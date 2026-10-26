import type { Schemas } from "@/lib/api/types";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconSign } from "@/ui/icons/glyphs/sign";

import { defineStatuses } from "./index";

/**
 * `InspectionStatus` of a move-in / move-out report as the resident sees it (L5 5.2, D-253) — liff-owned: only the
 * two states a resident is shown (`completed` = waiting for my signature, `signed`); the others never reach the app.
 */
export type ResidentInspectionStatus = Extract<Schemas["InspectionStatus"], "completed" | "signed">;

export const INSPECTION_STATUS = defineStatuses<ResidentInspectionStatus>("inspection", {
  completed: { tone: "warning", icon: IconSign },
  signed: { tone: "success", icon: IconCheckCircle },
});
