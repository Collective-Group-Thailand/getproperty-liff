"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { browserApi, unwrap } from "@/lib/api/browser";
import { isApiError, type ApiError } from "@/lib/api/problem";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { PhoneInput, toE164 } from "@/ui/components/PhoneInput";

import { savePendingOtp } from "./otpSession";

/**
 * Sign-in outside LINE (D-060): "open in LINE" first — it signs in without a code — then the SMS fallback:
 * phone → `/v1/auth/resident/otp/request` → a code and a link by SMS → `/auth/otp`. The API answers the same
 * whether or not the number is known (no account enumeration, D-164), and so does this page.
 */
export function SignIn({ next, lineHref }: { next: string; lineHref: string }) {
  const t = useTranslations("resident.auth.signIn");
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const e164 = toE164(phone);
    if (!e164) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setError(null);
    setBusy(true);
    try {
      const challenge = unwrap(
        await browserApi.POST("/v1/auth/resident/otp/request", {
          body: { phone: e164, language: document.documentElement.lang === "en" ? "en" : "th" },
        }),
      );
      savePendingOtp({ ...challenge, phone: e164 });
      const params = new URLSearchParams({ c: challenge.challengeId });
      if (next !== "/") params.set("next", next);
      router.push(`/auth/otp?${params.toString()}`);
    } catch (caught) {
      if (isApiError(caught)) setError(caught);
      else throw caught;
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 py-6" data-testid="sign-in">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>

      <Card as="section" padding="md" className="flex flex-col gap-3">
        <Button asChild size="lg" block iconStart="chat">
          <a href={lineHref} data-testid="open-in-line">
            {t("openInLine")}
          </a>
        </Button>
        <p className="text-muted text-center text-sm">{t("lineHint")}</p>
      </Card>

      <p className="text-muted text-center text-sm" aria-hidden="true">
        {t("or")}
      </p>

      <Card as="section" padding="md" aria-labelledby="sms-title">
        <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
          <h2 id="sms-title" className="font-semibold">
            {t("smsTitle")}
          </h2>
          <Field label={t("phoneLabel")} hint={t("phoneHint")} error={invalid ? t("invalidPhone") : undefined}>
            <PhoneInput value={phone} onChange={setPhone} autoComplete="tel-national" name="phone" />
          </Field>
          {error ? <ProblemCallout error={error} /> : null}
          <Button type="submit" size="lg" block variant="secondary" loading={busy} data-testid="send-code">
            {t("submit")}
          </Button>
        </form>
      </Card>
    </div>
  );
}
