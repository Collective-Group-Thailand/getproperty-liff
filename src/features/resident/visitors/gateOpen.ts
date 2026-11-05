/**
 * Opening the barrier from the phone (D-316, D-328) as a small state machine — pure, unit-tested; `OpenBarrier` drives
 * it. The API answers 202 when the command is on its way (sent once, refused by the edge after 30 s); the resident
 * never learns the barrier's own state, so the screen says "opening" for a moment and then "sent", honestly.
 *
 *   idle ──press──▶ locating (only when the estate asks for the phone location) ──▶ sending ──202──▶ opening ──▶ sent
 *                                         └─ denied / unavailable                  └─ problem ─▶ rate_limited | not_allowed
 *                                                                                                | outside | no_estate_location
 *                                                                                                | no_barrier | failed
 */
export type OpenState =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "sending" }
  | { kind: "opening"; until: number }
  | { kind: "sent"; at: number }
  | { kind: "rate_limited"; retryAt: number }
  | { kind: "not_allowed" }
  | { kind: "outside" }
  | { kind: "location_denied" }
  | { kind: "location_unavailable" }
  | { kind: "no_estate_location" }
  | { kind: "no_barrier" }
  | { kind: "failed"; requestId?: string };

export type OpenEvent =
  | { type: "press"; requireGeofence: boolean }
  | { type: "located" }
  | { type: "locationError"; denied: boolean }
  | { type: "accepted"; now: number }
  | {
      type: "problem";
      status: number;
      code: string;
      retryAfterSeconds?: number | null;
      now: number;
      requestId?: string;
    }
  | { type: "tick"; now: number };

/** How long "opening" shows after the API took the command (a barrier pulse is ~1 s; the edge acts within seconds). */
export const OPENING_MS = 4000;
/** Without `Retry-After`: the per-gate interval (`gate.open.min_interval_seconds`, 3 s) is the API's; wait a little more. */
export const DEFAULT_RETRY_SECONDS = 5;

export function busy(state: OpenState): boolean {
  return state.kind === "locating" || state.kind === "sending" || state.kind === "opening";
}

/** The button can be pressed again (not while busy, not while the API asked to wait, not when refused for good). */
export function canPress(state: OpenState, now: number): boolean {
  if (busy(state)) return false;
  if (state.kind === "rate_limited") return now >= state.retryAt;
  return state.kind !== "not_allowed" && state.kind !== "no_barrier" && state.kind !== "no_estate_location";
}

export function step(state: OpenState, event: OpenEvent): OpenState {
  switch (event.type) {
    case "press":
      if (busy(state)) return state;
      return event.requireGeofence ? { kind: "locating" } : { kind: "sending" };
    case "located":
      return state.kind === "locating" ? { kind: "sending" } : state;
    case "locationError":
      if (state.kind !== "locating") return state;
      return event.denied ? { kind: "location_denied" } : { kind: "location_unavailable" };
    case "accepted":
      return { kind: "opening", until: event.now + OPENING_MS };
    case "problem":
      return fromProblem(event);
    case "tick":
      if (state.kind === "opening" && event.now >= state.until) return { kind: "sent", at: event.now };
      if (state.kind === "rate_limited" && event.now >= state.retryAt) return { kind: "idle" };
      return state;
  }
}

function fromProblem(event: Extract<OpenEvent, { type: "problem" }>): OpenState {
  const { status, code } = event;
  if (status === 429) {
    const seconds =
      event.retryAfterSeconds && event.retryAfterSeconds > 0 ? event.retryAfterSeconds : DEFAULT_RETRY_SECONDS;
    return { kind: "rate_limited", retryAt: event.now + seconds * 1000 };
  }
  if (code === "gate.outside_geofence") return { kind: "outside" };
  if (code === "gate.geofence_unavailable") return { kind: "no_estate_location" };
  if (code === "gate.no_barrier") return { kind: "no_barrier" };
  // Switched off by the estate, a car or gate that is no longer mine (404), or not allowed at all.
  if (code === "gate.resident_open_disabled" || status === 404 || status === 403) return { kind: "not_allowed" };
  return { kind: "failed", requestId: event.requestId };
}

/** Seconds left before another try (rounded up; 0 when free). */
export function retryIn(state: OpenState, now: number): number {
  return state.kind === "rate_limited" ? Math.max(0, Math.ceil((state.retryAt - now) / 1000)) : 0;
}

/** `Retry-After` as seconds (delta form; an HTTP date is turned into seconds from now). */
export function parseRetryAfter(value: string | null | undefined, now: number): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? null : Math.max(0, Math.ceil((at - now) / 1000));
}

/** The remembered car / gate choice key on this device (plain ids, no personal data; storage may throw in LINE). */
export const CHOICE_KEY = "gp.gate.choice";
