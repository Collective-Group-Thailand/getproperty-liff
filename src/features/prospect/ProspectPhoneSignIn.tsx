"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { formatPhone } from "@/i18n/format";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Field } from "@/ui/components/Field";
import { OTPInput } from "@/ui/components/OTPInput";
import { PhoneInput, toE164 } from "@/ui/components/PhoneInput";

/**
 * A prospect's phone sign-in outside LINE (D-255, D-283): the number → `/v1/auth/prospect/otp/request` (any phone —
 * a prospect has no account yet) → the six digits → `…/otp/verify`; the BFF keeps the prospect's session cookies.
 */
export function ProspectPhoneSignIn({ next }: { next: string }) {
  const t = useTranslations("prospect.rent.signIn.phone");
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [challenge, setChallenge] = useState<{ id: string; phone: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function send(event?: React.FormEvent) {
    event?.preventDefault();
    const e164 = challenge?.phone ?? toE164(phone);
    if (!e164) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setError(null);
    setBusy(true);
    try {
      const sent = unwrap(
        await browserApi.POST("/v1/auth/prospect/otp/request", {
          body: { phone: e164, language: document.documentElement.lang === "th" ? "th" : "en" },
        }),
      );
      setChallenge({ id: sent.challengeId, phone: e164 });
      setCode("");
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (!challenge || value.length !== 6) return;
    setBusy(true);
    setError(null);
    let leaving = false;
    try {
      unwrap(
        await browserApi.POST("/v1/auth/prospect/otp/verify", { body: { challengeId: challenge.id, code: value } }),
      );
      leaving = true;
      router.replace(next);
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
      setCode("");
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  const attempts = typeof error?.problem.attemptsRemaining === "number" ? error.problem.attemptsRemaining : null;

  if (!challenge) {
    return (
      <form className="flex flex-col gap-4" onSubmit={send} noValidate data-testid="prospect-phone">
        <Field label={t("label")} hint={t("hint")} error={invalid ? t("invalid") : undefined}>
          <PhoneInput value={phone} onChange={setPhone} autoComplete="tel-national" name="phone" />
        </Field>
        {error ? <ProblemCallout error={error} /> : null}
        <Button type="submit" size="lg" block variant="secondary" loading={busy} data-testid="prospect-send-code">
          {t("send")}
        </Button>
      </form>
    );
  }
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      data-testid="prospect-code"
      onSubmit={(event) => {
        event.preventDefault();
        void verify(code);
      }}
    >
      <p className="text-muted text-sm">{t("sentTo", { phone: formatPhone(challenge.phone) })}</p>
      <OTPInput
        value={code}
        onChange={setCode}
        onComplete={(value) => void verify(value)}
        digitLabel={(index) => t("digit", { index: index + 1 })}
        disabled={busy}
        autoFocus
      />
      {error && error.code === "auth.otp_invalid" && attempts !== null ? (
        <Callout tone="danger">{t("wrong", { count: attempts })}</Callout>
      ) : error ? (
        <ProblemCallout error={error} />
      ) : null}
      <Button type="submit" size="lg" block loading={busy} disabled={code.length !== 6} data-testid="prospect-verify">
        {t("verify")}
      </Button>
      <div className="flex justify-between gap-2 text-sm">
        <Button type="button" variant="link" size="sm" onClick={() => setChallenge(null)}>
          {t("change")}
        </Button>
        <Button type="button" variant="link" size="sm" disabled={busy} onClick={() => void send()}>
          {t("resend")}
        </Button>
      </div>
    </form>
  );
}
