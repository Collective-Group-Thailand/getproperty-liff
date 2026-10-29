"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { LazyCheckbox, WhenNear } from "@/features/shared/WhenNear";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";

import { RELOCATION_PURPOSE } from "./model";

/**
 * Turning relocation help on (D-299, D-025): a box of its own, **never pre-ticked**, under the text the API returned;
 * the version shown is the one recorded (`POST /v1/resident/consents`). Nothing else is asked or stored here — the
 * destination comes later, on the offer.
 */
export function RelocationConsentForm({ version, language }: { version: number; language: "th" | "en" }) {
  const t = useTranslations("resident.relocation.consent");
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!accepted) {
      setMissing(true);
      return;
    }
    setBusy(true);
    setError(null);
    let leaving = false;
    try {
      unwrap(
        await browserApi.POST("/v1/resident/consents", {
          body: { language, items: [{ purposeKey: RELOCATION_PURPOSE, version, granted: true }] },
        }),
      );
      leaving = true;
      router.replace("/relocation?on=1", { scroll: true });
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit} noValidate data-testid="relocation-consent-form">
      {/* D-179: the Radix checkbox loads once the box is on screen (it sits under the consent text). */}
      <WhenNear fallbackClassName="h-16 w-full" margin="0px" testId="relocation-consent-slot">
        <LazyCheckbox
          label={t("agree", { version })}
          description={t("agreeHint")}
          checked={accepted}
          onCheckedChange={(checked) => {
            setAccepted(checked === true);
            setMissing(false);
          }}
          required
          data-testid="relocation-consent-box"
        />
      </WhenNear>
      {missing ? (
        <Callout tone="danger">
          <span role="alert">{t("required")}</span>
        </Callout>
      ) : null}
      {error ? <ProblemCallout error={error} /> : null}
      <Button type="submit" size="lg" block loading={busy} data-testid="relocation-consent-submit">
        {t("submit")}
      </Button>
    </form>
  );
}
