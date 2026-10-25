"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { SegmentedControl } from "@/ui/components/SegmentedControl";
import { IconForward } from "@/ui/icons/glyphs/forward";

type Purpose = Schemas["RentCertificatePurpose"];
type Language = "th" | "en";

const PURPOSES: readonly Purpose[] = ["visa", "bank", "employer", "other"];

/**
 * Asks the landlord for a rent payment certificate (B7.5, D-253): what it is for, the language, an optional note.
 * The period is the API's default (the last 12 months, not before the lease began) and is never computed here; one
 * open request at a time — a second one comes back as `rent_certificate.request_open` and is shown as it is.
 */
export function CertificateRequestForm({ leaseId, defaultLanguage }: { leaseId: string; defaultLanguage: Language }) {
  const t = useTranslations("resident.lease.certificates.form");
  const router = useRouter();
  const [purpose, setPurpose] = useState<Purpose>("visa");
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await browserApi.POST("/v1/resident/leases/{leaseId}/rent-certificates", {
          params: { path: { leaseId } },
          body: { purpose, language, note: note.trim() || null },
        }),
      );
      setNote("");
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="section" aria-labelledby="certificate-form-title" data-testid="certificate-form">
      <h2 id="certificate-form-title" className="font-semibold">
        {t("title")}
      </h2>
      <p className="text-muted mt-1 mb-4 text-sm">{t("lead")}</p>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium" aria-hidden="true">
            {t("purpose")}
          </span>
          <SegmentedControl
            label={t("purpose")}
            fullWidth
            size="lg"
            value={purpose}
            onValueChange={(value) => setPurpose(value as Purpose)}
            options={PURPOSES.map((value) => ({ value, label: t(`purposes.${value}`) }))}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium" aria-hidden="true">
            {t("language")}
          </span>
          <SegmentedControl
            label={t("language")}
            fullWidth
            size="lg"
            value={language}
            onValueChange={(value) => setLanguage(value as Language)}
            options={[
              { value: "th", label: t("languages.th") },
              { value: "en", label: t("languages.en") },
            ]}
          />
          <span className="text-muted text-sm">{t("languageHint")}</span>
        </div>
        <Field label={t("note")} hint={t("noteHint")} error={error?.fieldError("note")}>
          <Textarea
            name="note"
            value={note}
            maxLength={300}
            onChange={(event) => setNote(event.target.value)}
            data-testid="certificate-note"
          />
        </Field>
        {error && !error.fieldError("note") ? <ProblemCallout error={error} /> : null}
        <Button type="submit" size="lg" block loading={busy} iconEnd={IconForward} data-testid="certificate-submit">
          {t("submit")}
        </Button>
      </form>
    </Card>
  );
}
