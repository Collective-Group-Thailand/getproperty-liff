"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatPhone } from "@/i18n/format";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Field } from "@/ui/components/Field";
import { OTPInput } from "@/ui/components/OTPInput";
import { PhoneInput, toE164 } from "@/ui/components/PhoneInput";

/**
 * A verified phone for self-viewing (D-295): a LINE sign-in has no phone, so the prospect proves one with an SMS code
 * (`/v1/prospect/me/phone/otp` → `/v1/prospect/me/phone`). A number another account holds is refused by the API
 * (`auth.identity_in_use`, its words). Done → the page reads the requirements again.
 */
export function PhoneVerify() {
  const t = useTranslations("prospect.selfViewing.phone");
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
        await browserApi.POST("/v1/prospect/me/phone/otp", {
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
    try {
      unwrap(await browserApi.POST("/v1/prospect/me/phone", { body: { challengeId: challenge.id, code: value } }));
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
      setCode("");
      setBusy(false);
    }
  }

  const attempts = typeof error?.problem.attemptsRemaining === "number" ? error.problem.attemptsRemaining : null;

  if (!challenge) {
    return (
      <form className="flex flex-col gap-3" onSubmit={send} noValidate data-testid="self-phone">
        <Field label={t("label")} hint={t("hint")} error={invalid ? t("invalid") : undefined}>
          <PhoneInput value={phone} onChange={setPhone} autoComplete="tel-national" name="phone" />
        </Field>
        {error ? <ProblemCallout error={error} /> : null}
        <Button type="submit" size="lg" block variant="secondary" loading={busy} data-testid="self-phone-send">
          {t("send")}
        </Button>
      </form>
    );
  }
  return (
    <form
      className="flex flex-col gap-3"
      noValidate
      data-testid="self-phone-code"
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
      <Button type="submit" size="lg" block loading={busy} disabled={code.length !== 6} data-testid="self-phone-verify">
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
