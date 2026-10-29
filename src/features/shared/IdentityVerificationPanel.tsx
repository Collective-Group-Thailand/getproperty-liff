"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { rememberReturn } from "@/features/prospect/selfViewing/verificationReturn";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconExternal } from "@/ui/icons/glyphs/external";
import { IconRefresh } from "@/ui/icons/glyphs/refresh";
import { IconShield } from "@/ui/icons/glyphs/shield";

type Status = Schemas["IdentityVerificationDto"];
export type VerificationAudience = "resident" | "prospect";

async function start(audience: VerificationAudience): Promise<Status> {
  return audience === "resident"
    ? unwrap(await browserApi.POST("/v1/resident/me/identity-verification", { body: {} }))
    : unwrap(await browserApi.POST("/v1/prospect/me/identity-verification", { body: {} }));
}

/**
 * Verify my identity (D-267, O-021) — the same screen for residents (profile) and people looking to rent: verify once
 * at the licensed e-KYC provider (ID card and selfie); the provider sends me back here. Only the outcome is kept;
 * without a provider configured the screen says it is not offered yet.
 */
export function IdentityVerificationPanel({
  audience,
  status,
  locale,
  returnTo = null,
}: {
  audience: VerificationAudience;
  status: Status;
  locale: Locale;
  /** A booking to come back to after the provider (prospects, `?next=`): remembered in this tab before leaving. */
  returnTo?: string | null;
}) {
  const t = useTranslations("verification");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const latest = status.latest;
  const state = status.verified ? "verified" : (latest?.state ?? "none");

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const next = await start(audience);
      const url = next.latest?.state === "pending" ? next.latest.verificationUrl : null;
      if (url) {
        if (returnTo) rememberReturn(returnTo);
        window.location.assign(url);
      } else router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-testid="verification" data-state={state}>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t(`lead.${audience}`)}</p>
      </div>

      <Card as="section" padding="md" className="flex flex-col gap-4" aria-labelledby="verification-status">
        <div className="flex items-center justify-between gap-3">
          <h2 id="verification-status" className="font-semibold">
            {t("statusTitle")}
          </h2>
          {status.verified ? (
            <Badge tone="success" icon={IconCheckCircle}>
              {t("verified")}
            </Badge>
          ) : latest?.state === "pending" ? (
            <Badge tone="warning">{t("pending")}</Badge>
          ) : (
            <Badge tone="neutral">{t("notVerified")}</Badge>
          )}
        </div>

        {status.verified ? (
          <p data-testid="verification-verified">
            {t(`verifiedBody.${audience}`, {
              date: status.verifiedAt ? formatDateTime(status.verifiedAt, locale) : "",
            })}
          </p>
        ) : !status.available ? (
          <Callout tone="neutral" title={t("unavailableTitle")}>
            {t("unavailableBody")}
          </Callout>
        ) : latest?.state === "pending" && latest.verificationUrl ? (
          <>
            <p>{t("pendingBody", { date: formatDateTime(latest.expiresAt, locale) })}</p>
            <Button asChild size="lg" block iconStart={IconExternal}>
              <a
                href={latest.verificationUrl}
                onClick={() => {
                  if (returnTo) rememberReturn(returnTo);
                }}
                data-testid="verification-continue"
              >
                {t("continue")}
              </a>
            </Button>
            <Button
              variant="secondary"
              size="lg"
              block
              iconStart={IconRefresh}
              onClick={() => router.refresh()}
              data-testid="verification-refresh"
            >
              {t("refresh")}
            </Button>
          </>
        ) : (
          <>
            {latest?.state === "rejected" ? (
              <Callout tone="danger" title={t("rejectedTitle")}>
                <span data-testid="verification-reason">{latest.failureReason ?? t("rejectedNoReason")}</span>
              </Callout>
            ) : null}
            {latest?.state === "expired" ? <Callout tone="warning">{t("expired")}</Callout> : null}
            <ol className="flex flex-col gap-3" role="list">
              {(["card", "selfie", "result"] as const).map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span
                    className="bg-primary-subtle text-primary-subtle-fg flex size-8 shrink-0 items-center justify-center rounded-full font-semibold tabular-nums"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-medium">{t(`steps.${step}.title`)}</span>
                    <span className="text-muted text-sm">{t(`steps.${step}.body`)}</span>
                  </span>
                </li>
              ))}
            </ol>
            <Button
              size="lg"
              block
              iconStart={IconShield}
              loading={busy}
              onClick={() => void begin()}
              data-testid="verification-start"
            >
              {latest?.state === "rejected" || latest?.state === "expired" ? t("startAgain") : t("start")}
            </Button>
            {error ? <ProblemCallout error={error} /> : null}
          </>
        )}
      </Card>

      <p className="text-muted text-sm">{t("privacy")}</p>
    </div>
  );
}
