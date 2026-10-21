"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";

import { bffJson } from "@/lib/api/browser";
import { rescopePath } from "@/lib/auth/scopes";
import { onRealtime } from "@/lib/realtime/events";

import {
  LINK_CHANGED_EVENT,
  LINK_CHECK_ATTRIBUTE,
  linkDecision,
  type LinkSnapshot,
  type MeForDecision,
} from "./linkDecision";

const subscribeNothing = () => () => undefined;
const hydratedSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * Keeps the server-rendered "waiting for the office" card (D-226) current without a reload. When the office decides
 * — the realtime `party.link_changed` on the resident's `user:` channel (D-228) — or the resident taps "check again",
 * `/me` is read and compared with what the page showed (`linkDecision`): a confirmed link rotates the session
 * through `/auth/rescope` and comes back with the unit; a declined one swaps the card for `declined`; anything else
 * pending re-renders the page. "Check again" stays a plain link to the page, so without JavaScript, or when `/me`
 * cannot be read, it is the full reload it always was.
 *
 * Everything shown is server-rendered and passed in (`children`, `declined`, `stillWaiting`) — the client half is
 * just this logic (D-179).
 */
export function LinkPendingWatch({
  pending,
  unitIds,
  children,
  declined,
  stillWaiting,
}: LinkSnapshot & {
  children: ReactNode;
  /** Shown instead of `children` once the office declined. */
  declined?: ReactNode;
  /** Announced after "check again" found nothing decided yet. */
  stillWaiting?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"waiting" | "declined">("waiting");
  const [status, setStatus] = useState("");
  // Set once hydrated: "check again" is handled in place from then on (until then it is the plain reload).
  const ready = useSyncExternalStore(subscribeNothing, hydratedSnapshot, serverSnapshot);
  const busy = useRef(false);
  const snapshot = useRef<LinkSnapshot>({ pending, unitIds });
  useEffect(() => {
    snapshot.current = { pending, unitIds };
  }, [pending, unitIds]);

  // A check asked for while one is running (an event during the arrival check, a tap during an event's) runs right
  // after it, never dropped; a manual one keeps its "still waiting" answer and its reload fallback.
  const queued = useRef<{ manual: boolean; fallback?: string } | null>(null);
  const check = useCallback(
    async (manual: boolean, fallback?: string) => {
      const earlier = queued.current;
      queued.current = { manual: manual || !!earlier?.manual, fallback: fallback ?? earlier?.fallback };
      if (busy.current) return;
      busy.current = true;
      try {
        while (queued.current) {
          const run = queued.current;
          queued.current = null;
          setStatus("");
          try {
            const me = await bffJson<MeForDecision>("/v1/resident/me");
            const decision = linkDecision(snapshot.current, me);
            if (decision === "confirmed") {
              window.location.assign(rescopePath(`${window.location.pathname}${window.location.search}`));
              return;
            }
            if (decision === "declined" && declined) setState("declined");
            else if (decision === "declined" || decision === "changed") router.refresh();
            else if (run.manual && stillWaiting) setStatus(stillWaiting);
          } catch {
            // `/me` could not be read (offline, session ended): the plain reload decides — sign-in or the error page.
            if (run.fallback) {
              window.location.assign(run.fallback);
              return;
            }
          }
        }
      } finally {
        busy.current = false;
      }
    },
    [declined, router, stillWaiting],
  );

  useEffect(() => onRealtime(LINK_CHANGED_EVENT, () => void check(false)), [check]);
  // This module loads on demand (D-179): a decision heard between the server render and now would be lost, so /me is
  // read once on arrival (quietly — nothing is said when it is still waiting).
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;
    void check(false);
  }, [check]);

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const link = (event.target as Element).closest<HTMLAnchorElement>(`a[${LINK_CHECK_ATTRIBUTE}]`);
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
      return;
    event.preventDefault();
    void check(true, link.href);
  };

  if (state === "declined") return <>{declined}</>;
  return (
    // The wrapper only delegates the activation (click, Enter) of the "check again" link inside it.
    <div onClick={onClick} data-testid="link-pending-watch" data-ready={ready ? "" : undefined}>
      {children}
      <p
        role="status"
        aria-live="polite"
        // Always in the document (a live region added together with its text is often not announced).
        className={status ? "text-muted mt-2 text-sm" : "sr-only"}
        data-testid="link-pending-status"
      >
        {status}
      </p>
    </div>
  );
}
