"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { lazy, Suspense, useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { ActionDock } from "@/features/shared/Screen";
import { formatDate, formatTHB } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { useIdempotentAttempt } from "@/lib/api/attempt";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { SegmentedControl } from "@/ui/components/SegmentedControl";
import { Icon } from "@/ui/icons";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconQr } from "@/ui/icons/glyphs/qr";
import { IconShield } from "@/ui/icons/glyphs/shield";

import { clearanceOutcome, type ClearanceOutcome } from "./model";

/** The certificate (paper, download, share) loads once there is one to show (D-179: the form page stays small). */
const CertificateView = lazy(() => import("./CertificateView").then((module) => ({ default: module.CertificateView })));

export interface ClearanceRequestProps {
  unitId: string;
  unitName: string;
  today: string;
  /** The last day the API accepts as `asOf` (today + 60, as the contract states). */
  latest: string;
  /** `OWNER_CONSOLE_URL` — the public verification page lives there (`/verify/<code>`). */
  verifyBase?: string;
  /** Stories and tests: start on an outcome. */
  initial?: ClearanceOutcome;
}

/**
 * Asking for the debt-clearance certificate (D-306), e.g. before selling: the day it should speak for (today … +60 days)
 * and its language → `POST …/debt-clearance-requests` (one Idempotency-Key per intent). Issued at once when nothing is
 * outstanding (the certificate, its download and the share link with the one-time verification code); with a fee it
 * waits for the office. **Outstanding** (409 `debt_clearance.outstanding`) is not an error but a calm refusal screen:
 * what is still to pay, from the API, and one filled action — pay first, then ask again. Never ลูกหนี้ (J-DESIGN §1.2).
 */
export function ClearanceRequest({ unitId, unitName, today, latest, verifyBase, initial }: ClearanceRequestProps) {
  const t = useTranslations("resident.fees.clearance");
  const current = useLocale();
  const locale = isLocale(current) ? current : "th";
  const attempt = useIdempotentAttempt<Schemas["DebtClearanceRequestDto"]>();
  const [asOf, setAsOf] = useState(today);
  const [language, setLanguage] = useState<"th" | "en">(locale === "th" ? "th" : "en");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ClearanceOutcome | null>(initial ?? null);

  async function submit() {
    setBusy(true);
    const intent = { asOf, language };
    const frozen = await attempt.prepare(intent, () => ({ asOf: asOf === today ? null : asOf, language }));
    try {
      const data = unwrap(
        await browserApi.POST("/v1/resident/units/{unitId}/debt-clearance-requests", {
          params: { path: { unitId }, header: { "Idempotency-Key": frozen.key } },
          body: frozen.body,
        }),
      );
      attempt.succeeded();
      setOutcome(clearanceOutcome({ data }));
    } catch (caught) {
      attempt.failed(caught);
      const error = toApiError(caught);
      // An outstanding amount stores nothing: asking again later is a new request.
      if (error.code === "debt_clearance.outstanding") attempt.succeeded();
      setOutcome(clearanceOutcome({ error }));
    } finally {
      setBusy(false);
    }
  }

  if (outcome?.kind === "outstanding") {
    return (
      <Card as="section" aria-labelledby="clearance-refused-title" padding="lg" data-testid="clearance-outstanding">
        <span
          className="bg-bg-subtle text-muted rounded-thumb grid size-10 place-items-center text-xl"
          aria-hidden="true"
        >
          <Icon icon={IconShield} />
        </span>
        <h2 id="clearance-refused-title" className="mt-3 text-lg font-semibold">
          {t("outstanding.title")}
        </h2>
        <p className="mt-1">
          {outcome.amount
            ? t("outstanding.body", {
                unit: unitName,
                amount: formatTHB(outcome.amount, locale),
                date: formatDate(asOf, locale),
              })
            : t("outstanding.bodyNoAmount", { unit: unitName, date: formatDate(asOf, locale) })}
        </p>
        {outcome.amount ? (
          <p className="mt-4 text-3xl font-semibold tabular-nums" data-testid="clearance-outstanding-amount">
            {formatTHB(outcome.amount, locale)}
          </p>
        ) : null}
        <p className="text-muted mt-3 text-sm">{t("outstanding.next")}</p>
        <div className="mt-5 flex flex-col gap-2">
          <Button asChild size="xl" block iconStart={IconQr}>
            <Link href="/fees" data-testid="clearance-pay-first">
              {t("outstanding.pay")}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg" block>
            <Link href={`/units/${unitId}/payment-plans`}>{t("outstanding.plan")}</Link>
          </Button>
        </div>
      </Card>
    );
  }

  if (outcome?.kind === "issued" || outcome?.kind === "requested") {
    const code = outcome.clearance.verifyCode;
    return (
      <div className="flex flex-col gap-4" data-testid="clearance-done">
        <Suspense fallback={<div className="rounded-card bg-bg-subtle h-64" aria-busy="true" />}>
          <CertificateView
            clearance={outcome.clearance}
            unitName={unitName}
            locale={locale}
            verifyUrl={code && verifyBase ? `${verifyBase.replace(/\/$/, "")}/verify/${code}` : undefined}
          />
        </Suspense>
        {code ? (
          <p className="text-muted text-sm" data-testid="clearance-code">
            {t("codeOnce")} <span className="text-fg font-mono">{code}</span>
          </p>
        ) : null}
        <Button asChild variant="ghost" size="lg" block>
          <Link href={`/units/${unitId}/debt-clearances`}>{t("toList")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      data-testid="clearance-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {outcome?.kind === "problem" ? <ProblemCallout error={outcome.error} /> : null}
      <Field
        label={t("form.asOf")}
        hint={t("form.asOfHint", { latest: formatDate(latest, locale) })}
        error={outcome?.kind === "problem" ? outcome.error.fieldError("asOf") : undefined}
      >
        <Input
          type="date"
          inputSize="lg"
          min={today}
          max={latest}
          value={asOf}
          onChange={(event) => setAsOf(event.target.value || today)}
          data-testid="clearance-as-of"
        />
      </Field>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium" aria-hidden="true">
          {t("form.language")}
        </span>
        <SegmentedControl
          label={t("form.language")}
          fullWidth
          size="lg"
          value={language}
          onValueChange={(value) => setLanguage(value as "th" | "en")}
          options={[
            { value: "th", label: t("form.languages.th") },
            { value: "en", label: t("form.languages.en") },
          ]}
        />
      </div>
      <p className="text-muted text-sm">{t("form.how")}</p>
      <ActionDock>
        <Button type="submit" size="xl" block loading={busy} iconEnd={IconForward} data-testid="clearance-submit">
          {t("form.submit")}
        </Button>
      </ActionDock>
    </form>
  );
}
