"use client";

import { useEffect, useReducer, useRef, useState } from "react";

import { Button } from "@/ui/components/Button";
import { LazyAlertDialog } from "@/ui/components/overlays";
import { Icon } from "@/ui/icons";
import { IconSiren } from "@/ui/icons/glyphs/siren";

import { HOLD_MS, IDLE, holdProgress, holdStep } from "./hold";

/** The ring's frame rate — a timer rather than animation frames, so the timing is the same in tests and on phones. */
const FRAME_MS = 40;
const RING = 2 * Math.PI * 18;

/**
 * Hold-to-confirm (J-DESIGN §4): press and hold 1.5 s while the ring fills; letting go earlier cancels, a quick tap
 * explains "hold". The press is a pointer gesture, so keyboard and screen-reader users get their own control — a
 * button that is invisible until focused and opens an ordinary confirm dialog (the hold surface itself is hidden from
 * assistive technology and out of the tab order; nothing is lost, it is the same action).
 */
export function HoldToConfirm({
  label,
  holdingLabel,
  tapHint,
  accessibleLabel,
  confirm,
  onConfirm,
  disabled,
  busy,
  testId = "hold-confirm",
}: {
  label: string;
  holdingLabel: string;
  /** Shown after a quick tap ("hold until the ring is full"). */
  tapHint: string;
  /** The keyboard / screen-reader path: the button that opens the dialog. */
  accessibleLabel: string;
  confirm: { title: string; body: string; confirmLabel: string; cancelLabel: string };
  onConfirm: () => void;
  disabled?: boolean;
  busy?: boolean;
  testId?: string;
}) {
  const [state, dispatch] = useReducer(holdStep, IDLE);
  const [now, setNow] = useState(0);
  const [dialog, setDialog] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    if (state.phase !== "holding") return;
    const timer = window.setInterval(() => {
      const at = performance.now();
      setNow(at);
      dispatch({ type: "tick", now: at });
    }, FRAME_MS);
    return () => window.clearInterval(timer);
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === "done" && !fired.current) {
      fired.current = true;
      onConfirm();
    }
  }, [state.phase, onConfirm]);

  // A failed send (or a closed sheet) arms the control again.
  useEffect(() => {
    if (!busy && state.phase === "done") {
      const timer = window.setTimeout(() => {
        fired.current = false;
        dispatch({ type: "reset" });
      }, 600);
      return () => window.clearTimeout(timer);
    }
  }, [busy, state.phase]);

  const progress = holdProgress(state, now);
  const holding = state.phase === "holding";
  const off = disabled || busy;

  return (
    <div className="flex flex-col gap-2" data-testid={testId} data-phase={state.phase}>
      <Button
        variant="destructive"
        size="lg"
        block
        className="sr-only focus:not-sr-only"
        disabled={off}
        onClick={() => setDialog(true)}
        data-testid={`${testId}-accessible`}
      >
        {accessibleLabel}
      </Button>
      <Button
        variant="destructive"
        size="xl"
        block
        aria-hidden="true"
        tabIndex={-1}
        disabled={off}
        className="relative touch-none overflow-hidden select-none"
        onPointerDown={(event) => {
          if (off) return;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          const at = performance.now();
          setNow(at);
          dispatch({ type: "down", now: at });
        }}
        onPointerUp={() => dispatch({ type: "up", now: performance.now() })}
        onPointerCancel={() => dispatch({ type: "cancel" })}
        onLostPointerCapture={() => dispatch({ type: "cancel" })}
        onContextMenu={(event) => event.preventDefault()}
        data-testid={`${testId}-surface`}
      >
        {/* The fill behind the label grows with the hold — the same red ink, faint. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 start-0 bg-current opacity-10"
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
        <span className="relative grid size-10 shrink-0 place-items-center">
          <svg viewBox="0 0 40 40" className="absolute inset-0 size-10" aria-hidden="true">
            {/* The ring starts at twelve o'clock (the group turns it, not a CSS rotate). */}
            <g transform="rotate(-90 20 20)">
              <circle cx="20" cy="20" r="18" fill="none" strokeWidth="3" className="stroke-current opacity-20" />
              <circle
                cx="20"
                cy="20"
                r="18"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                className="stroke-current"
                strokeDasharray={RING}
                strokeDashoffset={RING * (1 - progress)}
                data-testid={`${testId}-ring`}
                data-progress={progress.toFixed(2)}
              />
            </g>
          </svg>
          <Icon icon={IconSiren} className="text-xl" />
        </span>
        <span className="relative">{holding ? holdingLabel : label}</span>
      </Button>
      <p className="text-muted min-h-5 text-center text-sm" aria-hidden="true" data-testid={`${testId}-hint`}>
        {state.phase === "idle" && state.hint ? tapHint : ""}
      </p>
      <LazyAlertDialog
        open={dialog}
        onOpenChange={setDialog}
        title={confirm.title}
        description={confirm.body}
        confirmLabel={confirm.confirmLabel}
        cancelLabel={confirm.cancelLabel}
        tone="destructive"
        loading={busy}
        onConfirm={() => {
          setDialog(false);
          onConfirm();
        }}
      />
    </div>
  );
}

export { HOLD_MS };
