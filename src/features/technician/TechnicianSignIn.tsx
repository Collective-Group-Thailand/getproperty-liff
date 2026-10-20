"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatPhone } from "@/i18n/format";
import { browserApi, unwrap } from "@/lib/api/browser";
import { isApiError, type ApiError } from "@/lib/api/problem";
import type { OtpChallenge } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { OTPInput } from "@/ui/components/OTPInput";
import { PhoneInput, toE164 } from "@/ui/components/PhoneInput";
import { IconChat } from "@/ui/icons/glyphs/chat";

const secondsUntil = (iso: string, now: number) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000));

/**
 * Technician sign-in (L4 4.4 §1, D-210): inside LINE the LIFF entry signs in with LINE (audience `technician`);
 * elsewhere "open in LINE" or an SMS code — `/v1/auth/technician/otp/request` → `…/verify` through the BFF, which
 * keeps the tokens in the technician's own httpOnly cookies. The phone the office entered links the technician
 * party (`phone_match`); there is no invitation code for technicians in the contract. Same answer whether or not the
 * number is known (D-164).
 */
export function TechnicianSignIn({ lineHref, next }: { lineHref: string; next: string }) {
  const t = useTranslations("technician.auth");
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [challenge, setChallenge] = useState<(OtpChallenge & { phone: string }) | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  async function request(e164: string) {
    setBusy(true);
    setError(null);
    try {
      const sent = unwrap(await browserApi.POST("/v1/auth/technician/otp/request", { body: { phone: e164 } }));
      setChallenge({ ...sent, phone: e164 });
      setCode("");
    } catch (caught) {
      if (!isApiError(caught)) throw caught;
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (!challenge || value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await browserApi.POST("/v1/auth/technician/otp/verify", {
          body: { challengeId: challenge.challengeId, code: value },
        }),
      );
      router.replace(next);
      router.refresh();
    } catch (caught) {
      if (!isApiError(caught)) throw caught;
      setError(caught);
      setCode("");
      setBusy(false);
    }
  }

  if (challenge) {
    const wait = secondsUntil(challenge.resendAvailableAt, now);
    const attempts = typeof error?.problem.attemptsRemaining === "number" ? error.problem.attemptsRemaining : null;
    const finished = error?.code === "auth.otp_expired" || error?.code === "auth.otp_attempts_exceeded";
    return (
      <form
        className="flex flex-col gap-5 py-6"
        data-testid="technician-otp"
        onSubmit={(event) => {
          event.preventDefault();
          void verify(code);
        }}
      >
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold">{t("codeTitle")}</h1>
          <p className="text-muted">{t("codeLead", { phone: formatPhone(challenge.phone) })}</p>
        </div>
        <Field label={t("code")}>
          <OTPInput
            value={code}
            onChange={setCode}
            onComplete={(value) => void verify(value)}
            digitLabel={(index) => t("digit", { index: index + 1 })}
            disabled={busy || finished}
            autoFocus
          />
        </Field>
        {error && error.code === "auth.otp_invalid" && attempts !== null ? (
          <Callout tone="danger">{t("attempts", { count: attempts })}</Callout>
        ) : error ? (
          <ProblemCallout error={error} />
        ) : null}
        <Button
          type="submit"
          size="lg"
          block
          loading={busy}
          disabled={code.length !== 6 || finished}
          data-testid="technician-verify"
        >
          {t("verify")}
        </Button>
        <div className="flex flex-col items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={wait > 0 || busy}
            onClick={() => void request(challenge.phone)}
          >
            {wait > 0 ? t("resendIn", { seconds: wait }) : t("resend")}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setChallenge(null);
              setError(null);
            }}
          >
            {t("changePhone")}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-6" data-testid="technician-sign-in">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      <Card as="section" padding="md" className="flex flex-col gap-3">
        <Button asChild size="lg" block iconStart={IconChat}>
          <a href={lineHref} data-testid="technician-open-in-line">
            {t("openInLine")}
          </a>
        </Button>
        <p className="text-muted text-center text-sm">{t("lineHint")}</p>
      </Card>
      <p className="text-muted text-center text-sm" aria-hidden="true">
        {t("or")}
      </p>
      <Card as="section" padding="md" aria-labelledby="tech-sms-title">
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const e164 = toE164(phone);
            setInvalid(!e164);
            if (e164) void request(e164);
          }}
        >
          <h2 id="tech-sms-title" className="font-semibold">
            {t("smsTitle")}
          </h2>
          <Field label={t("phone")} hint={t("phoneHint")} error={invalid ? t("invalidPhone") : undefined}>
            <PhoneInput value={phone} onChange={setPhone} autoComplete="tel-national" name="phone" />
          </Field>
          {error ? <ProblemCallout error={error} /> : null}
          <Button type="submit" size="lg" block variant="secondary" loading={busy} data-testid="technician-send-code">
            {t("send")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
