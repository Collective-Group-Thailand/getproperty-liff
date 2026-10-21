"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { acceptLanguage, browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { ConsentPurpose } from "@/lib/api/types";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";

/**
 * Consent management (D-025): every purpose in its current version with my answer; grant or withdraw one at a
 * time (`POST /v1/resident/consents` appends a row per purpose and controller). Withdrawing a required purpose is
 * allowed — the law gives that right — after a confirmation that says what it means: the app asks again before it
 * can be used (the API reports `consentComplete: false`).
 */
export function ConsentManager({
  purposes,
  capturedOn,
}: {
  purposes: ConsentPurpose[];
  capturedOn: Record<string, string>;
}) {
  const t = useTranslations("resident.profile.consents");
  const common = useTranslations("common");
  const router = useRouter();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function answer(purpose: ConsentPurpose, granted: boolean) {
    setBusy(purpose.key);
    setError(null);
    try {
      const language = acceptLanguage();
      unwrap(
        await browserApi.POST("/v1/resident/consents", {
          body: {
            language: language === "en" ? "en" : "th",
            items: [{ purposeKey: purpose.key, version: purpose.version, granted }],
          },
        }),
      );
      setConfirm(null);
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="consent-manager">
      <ul className="flex flex-col gap-3" role="list">
        {purposes.map((purpose) => {
          const granted = purpose.granted === true && purpose.grantedVersion === purpose.version;
          return (
            <li key={purpose.key}>
              <Card as="section" padding="md" aria-labelledby={`consent-${purpose.key}`} data-purpose={purpose.key}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {/* Body font, not a heading: the display font arrives late and long Thai titles would re-wrap. */}
                  <p id={`consent-${purpose.key}`} className="font-semibold">
                    {purpose.title}
                  </p>
                  <Badge tone={purpose.required ? "primary" : "neutral"} size="sm">
                    {purpose.required ? common("required") : common("optional")}
                  </Badge>
                </div>
                <p className="text-muted mt-1 text-sm">
                  {granted
                    ? t("granted", { date: capturedOn[purpose.key] ?? "—", version: purpose.version })
                    : purpose.granted === false
                      ? t("withdrawn", { date: capturedOn[purpose.key] ?? "—" })
                      : t("unanswered", { version: purpose.version })}
                </p>
                {confirm === purpose.key ? (
                  <div className="mt-3 flex flex-col gap-2" data-testid="consent-withdraw-confirm">
                    <Callout tone="warning">{purpose.required ? t("withdrawRequired") : t("withdrawOptional")}</Callout>
                    <Button
                      variant="destructive"
                      size="lg"
                      block
                      loading={busy === purpose.key}
                      onClick={() => void answer(purpose, false)}
                      data-testid="consent-withdraw-submit"
                    >
                      {t("withdrawConfirm")}
                    </Button>
                    <Button variant="ghost" size="lg" block onClick={() => setConfirm(null)}>
                      {common("cancel")}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3">
                    {granted ? (
                      <Button
                        variant="secondary"
                        size="lg"
                        block
                        onClick={() => setConfirm(purpose.key)}
                        data-testid={`consent-withdraw-${purpose.key}`}
                      >
                        {t("withdraw")}
                      </Button>
                    ) : (
                      <Button
                        size="lg"
                        block
                        loading={busy === purpose.key}
                        onClick={() => void answer(purpose, true)}
                        data-testid={`consent-grant-${purpose.key}`}
                      >
                        {t("grant")}
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
      {error ? <ProblemCallout error={error} /> : null}
    </div>
  );
}
