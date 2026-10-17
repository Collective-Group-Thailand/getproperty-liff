"use client";

import { lazy, Suspense, useSyncExternalStore } from "react";

const Toaster = lazy(() => import("@/ui/components/Toast").then((m) => ({ default: m.Toaster })));

/** Flips once, on the first tap or key press of the visit. */
let interacted = false;
const listeners = new Set<() => void>();

function onFirstInteraction() {
  interacted = true;
  window.removeEventListener("pointerdown", onFirstInteraction, true);
  window.removeEventListener("keydown", onFirstInteraction, true);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1 && !interacted) {
    window.addEventListener("pointerdown", onFirstInteraction, { capture: true, passive: true });
    window.addEventListener("keydown", onFirstInteraction, { capture: true });
  }
  return () => listeners.delete(listener);
}

/**
 * The toast region (sonner), loaded on the visit's first tap or key press instead of with the page: every toast
 * in this app answers something the resident did, and the page's initial JS stays smaller
 * (docs/performance-budgets.md).
 */
export function DeferredToaster() {
  const ready = useSyncExternalStore(
    subscribe,
    () => interacted,
    () => false,
  );
  if (!ready) return null;
  return (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  );
}
