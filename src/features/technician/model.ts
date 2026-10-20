import type { Schemas } from "@/lib/api/types";

export type WorkOrder = Schemas["TechnicianWorkOrderDto"];

/** `YYYY-MM-DD` in Bangkok. */
function bangkokDay(ms: number): string {
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
}

export interface WorkOrderGroups {
  today: WorkOrder[];
  upcoming: WorkOrder[];
  unscheduled: WorkOrder[];
  finished: WorkOrder[];
}

/**
 * "My work orders" by schedule (L4 4.4 §2): today's visits (and any earlier one still open — late work stays on top),
 * the next ones, those without a time, then the finished ones waiting for the owner's verification. Order within a
 * group is the API's (by visit time).
 */
export function groupWorkOrders(items: readonly WorkOrder[], now: number): WorkOrderGroups {
  const today = bangkokDay(now);
  const groups: WorkOrderGroups = { today: [], upcoming: [], unscheduled: [], finished: [] };
  for (const item of items) {
    if (item.status === "done" || item.status === "verified" || item.status === "cancelled") groups.finished.push(item);
    else if (!item.scheduledAt) groups.unscheduled.push(item);
    else if (bangkokDay(Date.parse(item.scheduledAt)) <= today) groups.today.push(item);
    else groups.upcoming.push(item);
  }
  return groups;
}

/** Field steps the API offers (`nextActions` — never inferred from the status). */
export const FIELD_ACTIONS = ["accept", "check-in", "wait-parts", "resume", "complete"] as const;
export type FieldAction = (typeof FIELD_ACTIONS)[number];

export function fieldActions(workOrder: Pick<WorkOrder, "nextActions">): FieldAction[] {
  return FIELD_ACTIONS.filter((a) => workOrder.nextActions.includes(a));
}

/** Photos can be added while the work is assigned, accepted or in progress (the API refuses them afterwards). */
export function canAddPhotos(workOrder: Pick<WorkOrder, "status">): boolean {
  return workOrder.status === "assigned" || workOrder.status === "accepted" || workOrder.status === "in_progress";
}

/** A THB price or a quantity as the technician types it: digits with an optional decimal part (≤ 2 / ≤ 3 places). */
export function isMoneyInput(value: string): boolean {
  return /^\d{1,9}(\.\d{1,2})?$/.test(value.trim());
}

export function isQuantityInput(value: string): boolean {
  return /^\d{1,6}(\.\d{1,3})?$/.test(value.trim()) && /[1-9]/.test(value);
}
