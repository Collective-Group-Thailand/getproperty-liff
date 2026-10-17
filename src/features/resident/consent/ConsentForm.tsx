"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { browserApi, unwrap } from "@/lib/api/browser";
import { isApiError, type ApiError } from "@/lib/api/problem";
import type { ConsentPurpose } from "@/lib/api/types";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Checkbox } from "@/ui/components/Checkbox";

/** Purpose texts are Markdown from the API; shown as plain paragraphs (no HTML is ever injected). */
function paragraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[*_`#>]/g, "").trim())
    .filter(Boolean);
}

/**
 * PDPA consent on first use (D-025): the purposes, their versions and texts come from
 * `/v1/resident/consents` in the resident's language; required purposes must be accepted to use the app,
 * optional ones are opt-in (never pre-ticked). One `POST /v1/resident/consents` records every answer with
 * the version shown; withdrawal of optional purposes lives in the profile (L3).
 */
export function ConsentForm({
  purposes,
  language,
  next,
}: {
  purposes: ConsentPurpose[];
  language: string;
  next: string;
}) {
  const t = useTranslations("resident.consent");
  const common = useTranslations("common");
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(purposes.map((p) => [p.key, p.granted === true && p.grantedVersion === p.version])),
  );
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const changed = purposes.some((p) => p.grantedVersion !== null && p.grantedVersion !== p.version);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (purposes.some((p) => p.required && !answers[p.key])) {
      setMissing(true);
      return;
    }
    setMissing(false);
    setError(null);
    setBusy(true);
    try {
      unwrap(
        await browserApi.POST("/v1/resident/consents", {
          params: { header: { "accept-language": language } },
          body: {
            language: language === "en" ? "en" : "th",
            items: purposes.map((p) => ({ purposeKey: p.key, version: p.version, granted: answers[p.key] === true })),
          },
        }),
      );
      router.replace(next);
      router.refresh();
    } catch (caught) {
      if (!isApiError(caught)) throw caught;
      setError(caught);
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-5 py-6" onSubmit={submit} data-testid="consent-form" noValidate>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      {changed ? <Callout tone="info">{t("changed")}</Callout> : null}

      <ul className="flex flex-col gap-3" role="list">
        {purposes.map((purpose) => (
          <li key={purpose.key}>
            <Card as="section" padding="md" aria-labelledby={`purpose-${purpose.key}`} data-purpose={purpose.key}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id={`purpose-${purpose.key}`} className="font-semibold">
                  {purpose.title}
                </h2>
                <Badge tone={purpose.required ? "primary" : "neutral"} size="sm">
                  {purpose.required ? common("required") : common("optional")}
                </Badge>
              </div>
              <div className="text-muted mt-2 flex flex-col gap-2 text-sm">
                {paragraphs(purpose.bodyMarkdown).map((text, index) => (
                  <p key={index}>{text}</p>
                ))}
              </div>
              <p className="text-muted mt-2 text-xs">{t("version", { version: purpose.version })}</p>
              <Checkbox
                className="mt-3"
                label={purpose.required ? t("agreeRequired") : t("agreeOptional")}
                checked={answers[purpose.key] === true}
                onCheckedChange={(checked) =>
                  setAnswers((current) => ({ ...current, [purpose.key]: checked === true }))
                }
                name={purpose.key}
              />
            </Card>
          </li>
        ))}
      </ul>

      {missing ? <Callout tone="warning">{t("requiredMissing")}</Callout> : null}
      {error ? <ProblemCallout error={error} /> : null}

      <Button type="submit" size="lg" block loading={busy} data-testid="consent-submit">
        {t("submit")}
      </Button>
      <p className="text-muted text-center text-sm">{t("later")}</p>
    </form>
  );
}
