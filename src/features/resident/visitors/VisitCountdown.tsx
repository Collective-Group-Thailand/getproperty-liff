"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { clock, secondsLeft } from "./model";

/** While a visitor waits, the page re-reads itself this often as well (a dropped realtime stream must not strand anyone). */
export const WAITING_POLL_MS = 15_000;

/**
 * "0:48" — the time the household has left before the house policy applies (D-327: the clock lives on the visit,
 * `respondBy`). Ticks every second; at zero the page is read again and shows what the policy did. While waiting it
 * also re-reads the page every 15 s when the view is visible, so another member's answer appears without realtime.
 * The figure is a `timer` (not announced each second); its accessible name says the minutes left.
 */
export function VisitCountdown({ respondBy, initialSeconds }: { respondBy: string; initialSeconds: number }) {
  const t = useTranslations("resident.visitors.visit");
  const router = useRouter();
  const [seconds, setSeconds] = useState(initialSeconds);
  const refreshed = useRef(false);

  useEffect(() => {
    const tick = () => {
      const left = secondsLeft(respondBy, Date.now()) ?? 0;
      setSeconds(left);
      if (left === 0 && !refreshed.current) {
        refreshed.current = true;
        router.refresh();
      }
    };
    tick();
    const second = window.setInterval(tick, 1000);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, WAITING_POLL_MS);
    return () => {
      window.clearInterval(second);
      window.clearInterval(poll);
    };
  }, [respondBy, router]);

  if (seconds === 0) {
    return (
      <span data-testid="visit-countdown" data-seconds="0">
        {t("timeUp")}
      </span>
    );
  }
  return (
    <span
      role="timer"
      aria-label={t("countdownLabel", { minutes: Math.ceil(seconds / 60) })}
      className="text-fg font-mono font-semibold tabular-nums"
      data-testid="visit-countdown"
      data-seconds={seconds}
    >
      {clock(seconds)}
    </span>
  );
}
