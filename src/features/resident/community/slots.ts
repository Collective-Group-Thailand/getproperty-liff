import type { Schemas } from "@/lib/api/types";

type Policy = Schemas["BookingPolicyDto"];
type Busy = Schemas["BusySlotDto"];

/** The API's defaults when a policy leaves a field out (D-212: 60-minute slots, 08:00–22:00, ≤ 120 min, ≤ 14 days). */
export const POLICY_DEFAULTS = {
  slotMinutes: 60,
  openFrom: "08:00",
  openTo: "22:00",
  maxDurationMinutes: 120,
  maxAdvanceDays: 14,
} as const;

export interface Slot {
  /** ISO 8601 with the Bangkok offset — sent back to the API as-is. */
  startsAt: string;
  endsAt: string;
  /** `HH:MM` in Bangkok, for the label. */
  from: string;
  to: string;
}

export type SlotState = "free" | "busy" | "mine" | "past";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

function minutesOf(value: string): number {
  const [h, m] = value.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/**
 * The whole slots of one Bangkok day inside the opening hours (presentation of the API's policy — the API still
 * decides whether a booking is accepted: quota, overlap, approval).
 */
export function daySlots(policy: Policy, date: string): Slot[] {
  const step = policy.slotMinutes ?? POLICY_DEFAULTS.slotMinutes;
  const open = minutesOf(policy.openFrom ?? POLICY_DEFAULTS.openFrom);
  const close = minutesOf(policy.openTo ?? POLICY_DEFAULTS.openTo);
  const slots: Slot[] = [];
  for (let start = open; start + step <= close; start += step) {
    const end = start + step;
    slots.push({
      startsAt: `${date}T${hhmm(start)}:00+07:00`,
      endsAt: end >= 24 * 60 ? `${date}T23:59:59+07:00` : `${date}T${hhmm(end)}:00+07:00`,
      from: hhmm(start),
      to: hhmm(end % (24 * 60)),
    });
  }
  return slots;
}

/** Busy (someone else's), mine, already passed, or free — from the API's busy list of that day. */
export function slotState(slot: Slot, busy: readonly Busy[], now: number): SlotState {
  const start = Date.parse(slot.startsAt);
  const end = Date.parse(slot.endsAt);
  const overlapping = busy.find((b) => Date.parse(b.startsAt) < end && Date.parse(b.endsAt) > start);
  if (overlapping) return overlapping.mine ? "mine" : "busy";
  if (start <= now) return "past";
  return "free";
}

/** `YYYY-MM-DD` in Bangkok of an instant. */
export function bangkokDay(ms: number): string {
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** The days a resident can pick from: today and the next ones, at most `maxAdvanceDays` and never more than 7. */
export function bookingDays(policy: Policy, now: number, limit = 7): string[] {
  const days = Math.min(limit, policy.maxAdvanceDays ?? POLICY_DEFAULTS.maxAdvanceDays);
  return Array.from({ length: Math.max(1, days) }, (_, i) => bangkokDay(now + i * 86_400_000));
}

/** Durations offered after a free start slot: whole slots up to the policy's maximum, while the next slots are free. */
export function durationsFrom(index: number, slots: readonly Slot[], states: readonly SlotState[], policy: Policy) {
  const step = policy.slotMinutes ?? POLICY_DEFAULTS.slotMinutes;
  const max = Math.max(step, policy.maxDurationMinutes ?? POLICY_DEFAULTS.maxDurationMinutes);
  const out: { minutes: number; endsAt: string; to: string }[] = [];
  for (let i = index, minutes = step; i < slots.length && minutes <= max; i += 1, minutes += step) {
    if (states[i] !== "free") break;
    out.push({ minutes, endsAt: slots[i]!.endsAt, to: slots[i]!.to });
  }
  return out;
}
