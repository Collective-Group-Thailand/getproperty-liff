"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useReducer, useState } from "react";

import { isLocale } from "@/i18n/routing";
import { useIdempotentAttempt } from "@/lib/api/attempt";
import { bffJson, browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { UnitInvitationPreview } from "@/lib/api/types";

import { rememberUnit } from "./choice";
import { REDEEM_START, redeemProblem, redeemReducer, secondsUntil, type RedeemState } from "./redeem";
import { UnitRedeemView } from "./UnitRedeemView";

/**
 * `/link/unit?code=…` wired to the API (JRL, D-322): `…/otp` sends the code to the register's phone, `…/accept` links
 * this login (one Idempotency-Key per code and challenge, so a retry after a lost answer replays instead of "used"),
 * then the session is refreshed for the unit's scope and the new unit becomes the one on screen. A missing consent
 * (409 `consent.required`) goes through the consent screen and back here.
 */
export function UnitRedeem({
  code,
  preview,
  initial = REDEEM_START,
}: {
  code: string;
  preview: UnitInvitationPreview | null;
  initial?: RedeemState;
}) {
  const router = useRouter();
  const current = useLocale();
  const locale = isLocale(current) ? current : "th";
  const [state, dispatch] = useReducer(redeemReducer, initial);
  const [digits, setDigits] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const attempt = useIdempotentAttempt<{ challengeId: string; code: string }>();
  const challenge = "challenge" in state ? state.challenge : null;
  const resendAt = challenge?.resendAvailableAt ?? null;

  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAt]);

  const self = `/link/unit?code=${encodeURIComponent(code)}`;

  function fail(caught: unknown) {
    const problem = toApiError(caught);
    if (problem.code === "consent.required") {
      router.replace(`/consent?next=${encodeURIComponent(self)}`);
      return;
    }
    setError(problem);
    dispatch({ type: "failed", problem: redeemProblem(problem.code, problem.problem.attemptsRemaining) });
  }

  async function send() {
    setError(null);
    setDigits("");
    dispatch({ type: "send" });
    try {
      const sent = unwrap(
        await browserApi.POST("/v1/resident/unit-invitations/{code}/otp", { params: { path: { code } } }),
      );
      dispatch({ type: "sent", challenge: sent });
      setNow(Date.now());
    } catch (caught) {
      fail(caught);
    }
  }

  async function verify(value: string) {
    if (!challenge) return;
    setError(null);
    dispatch({ type: "verify" });
    try {
      const body = { challengeId: challenge.challengeId, code: value };
      const prepared = await attempt.prepare(body, () => body);
      const accepted = unwrap(
        await browserApi.POST("/v1/resident/unit-invitations/{code}/accept", {
          params: { path: { code }, header: { "Idempotency-Key": prepared.key } },
          body: prepared.body,
        }),
      );
      attempt.succeeded();
      // The unit is on file whatever the rotation does; when it fails the resident layout rotates (/auth/rescope).
      if (accepted.refreshRequired) await bffJson("/auth/refresh", { method: "POST" }).catch(() => undefined);
      rememberUnit(accepted.unitId);
      dispatch({ type: "accepted", accepted });
    } catch (caught) {
      attempt.failed(toApiError(caught));
      setDigits("");
      fail(caught);
    }
  }

  return (
    <UnitRedeemView
      preview={preview}
      state={state}
      digits={digits}
      resendIn={secondsUntil(resendAt, now)}
      locale={locale}
      error={error}
      onDigits={setDigits}
      onSend={() => void send()}
      onVerify={(value) => void verify(value)}
      onContinue={() => {
        router.replace("/");
        router.refresh();
      }}
    />
  );
}
