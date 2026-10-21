"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { formatPhone } from "@/i18n/format";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { afterResidentSignIn } from "@/lib/auth/afterSignIn";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { OTPInput } from "@/ui/components/OTPInput";

import { clearPendingOtp, readPendingOtp, savePendingOtp, type PendingOtp } from "./otpSession";

const secondsUntil = (iso: string, now: number) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000));

/**
 * The SMS code (magic-link landing, D-060): six digits → `/v1/auth/resident/otp/verify` → the BFF sets the
 * session cookies → the resident's language and consents decide where to go (`afterResidentSignIn`). Wrong codes
 * say how many tries are left (`attemptsRemaining`); an expired or exhausted challenge sends them back for a new
 * code.
 */
export function OtpVerify({ challengeFromUrl, next }: { challengeFromUrl: string | null; next: string }) {
  const t = useTranslations("resident.auth.otp");
  const router = useRouter();
  // Rendered on the client only (`OtpVerifyClient`), so the tab's pending challenge can be read up front.
  const [pending, setPending] = useState<PendingOtp | null>(() => {
    const stored = readPendingOtp();
    if (challengeFromUrl && stored?.challengeId !== challengeFromUrl) {
      return { challengeId: challengeFromUrl, phone: "", resendAvailableAt: "", expiresAt: "" };
    }
    return stored;
  });
  const [code, setCode] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wait = pending?.resendAvailableAt ? secondsUntil(pending.resendAvailableAt, now) : 0;

  useEffect(() => {
    if (!pending?.resendAvailableAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [pending?.resendAvailableAt]);

  async function verify(value: string) {
    if (!pending || value.length !== 6) return;
    setBusy(true);
    setError(null);
    let leaving = false;
    try {
      unwrap(
        await browserApi.POST("/v1/auth/resident/otp/verify", {
          body: { challengeId: pending.challengeId, code: value },
        }),
      );
      clearPendingOtp();
      const target = await afterResidentSignIn(next);
      leaving = true;
      router.replace(target);
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
      setCode("");
    } finally {
      // Stays busy only while the app navigates away after a sign-in (review M1).
      if (!leaving) setBusy(false);
    }
  }

  async function resend() {
    if (!pending?.phone) return;
    setError(null);
    try {
      const challenge = unwrap(
        await browserApi.POST("/v1/auth/resident/otp/request", { body: { phone: pending.phone } }),
      );
      const updated = { ...challenge, phone: pending.phone };
      savePendingOtp(updated);
      setPending(updated);
    } catch (caught) {
      setError(toApiError(caught));
    }
  }

  const restart = next === "/" ? "/auth" : `/auth?next=${encodeURIComponent(next)}`;

  if (pending === null) {
    return (
      <div className="flex flex-col gap-4 py-6" data-testid="otp-verify">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <Callout tone="warning">{t("noChallenge")}</Callout>
        <Button asChild size="lg" block>
          <Link href={restart}>{t("resend")}</Link>
        </Button>
      </div>
    );
  }

  const finished = error?.code === "auth.otp_expired" || error?.code === "auth.otp_attempts_exceeded";
  const attempts = typeof error?.problem.attemptsRemaining === "number" ? error.problem.attemptsRemaining : null;

  return (
    <form
      className="flex flex-col gap-5 py-6"
      data-testid="otp-verify"
      onSubmit={(event) => {
        event.preventDefault();
        void verify(code);
      }}
    >
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">
          {pending.phone ? t("lead", { phone: formatPhone(pending.phone) }) : t("leadNoPhone")}
        </p>
      </div>

      <OTPInput
        value={code}
        onChange={setCode}
        onComplete={(value) => void verify(value)}
        digitLabel={(index) => t("digit", { index: index + 1 })}
        disabled={busy || finished}
        autoFocus
      />

      {error && error.code === "auth.otp_invalid" && attempts !== null ? (
        <Callout tone="danger">{t("wrongCode", { count: attempts })}</Callout>
      ) : error ? (
        <ProblemCallout error={error} />
      ) : null}

      <Button
        type="submit"
        size="lg"
        block
        loading={busy}
        disabled={code.length !== 6 || finished}
        data-testid="verify-code"
      >
        {t("submit")}
      </Button>

      <div className="flex flex-col items-center gap-2">
        {pending.phone ? (
          <Button type="button" variant="ghost" disabled={wait > 0} onClick={() => void resend()}>
            {wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
          </Button>
        ) : (
          <Button asChild variant="ghost">
            <Link href={restart}>{t("resend")}</Link>
          </Button>
        )}
        <Button asChild variant="ghost">
          <Link href={restart}>{t("changePhone")}</Link>
        </Button>
      </div>
    </form>
  );
}
