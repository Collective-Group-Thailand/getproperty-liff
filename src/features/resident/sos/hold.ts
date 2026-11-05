/**
 * Hold-to-confirm (J-DESIGN §4): an SOS goes out only after the button is held for 1.5 s while a ring fills; letting
 * go earlier cancels. Pure, so the timing is unit-tested without a browser; `HoldToConfirm` feeds it pointer events
 * and animation frames. Screen-reader and keyboard users never hold: they get a confirm dialog instead.
 */
export const HOLD_MS = 1500;
/** A release this quick was a tap, not an attempt: the button explains "hold" instead of staying silent. */
export const TAP_MS = 350;

export type HoldState = { phase: "idle"; hint: boolean } | { phase: "holding"; start: number } | { phase: "done" };

export const IDLE: HoldState = { phase: "idle", hint: false };

export type HoldEvent =
  | { type: "down"; now: number }
  | { type: "up"; now: number }
  | { type: "cancel" }
  | { type: "tick"; now: number }
  | { type: "reset" };

export function holdStep(state: HoldState, event: HoldEvent): HoldState {
  switch (event.type) {
    case "down":
      return state.phase === "done" ? state : { phase: "holding", start: event.now };
    case "tick":
      if (state.phase === "holding" && event.now - state.start >= HOLD_MS) return { phase: "done" };
      return state;
    case "up":
      if (state.phase !== "holding") return state;
      if (event.now - state.start >= HOLD_MS) return { phase: "done" };
      // Released early: cancelled. A quick tap shows the hint; a longer, abandoned hold is respected silently.
      return { phase: "idle", hint: event.now - state.start < TAP_MS };
    case "cancel":
      return state.phase === "holding" ? { phase: "idle", hint: false } : state;
    case "reset":
      return IDLE;
  }
}

/** 0 … 1 — how far the ring has filled. */
export function holdProgress(state: HoldState, now: number): number {
  if (state.phase === "done") return 1;
  if (state.phase !== "holding") return 0;
  return Math.min(1, Math.max(0, (now - state.start) / HOLD_MS));
}
