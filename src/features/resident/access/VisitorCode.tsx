"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatDateTime } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { bffJson } from "@/lib/api/browser";
import type { VisitorCodeCreate } from "@/lib/api/contract-requests";
import { isApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { NativeSelect } from "@/ui/components/NativeSelect";

const HOURS = [2, 4, 8, 24];

/**
 * CONTRACT-REQUEST #26 — a time-boxed code for a visitor (D-070: visitors get time-boxed codes), from now for the
 * chosen hours, never longer than the operator allows. The code is shown once, big; the API keeps the record.
 */
export function VisitorCode({ unitId, maxHours }: { unitId: string; maxHours: number }) {
  const t = useTranslations("resident.access.visitor");
  const current = useLocale();
  const locale = isLocale(current) ? current : "th";
  const options = HOURS.filter((h) => h <= maxHours);
  const [name, setName] = useState("");
  const [hours, setHours] = useState(options[0] ?? maxHours);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [created, setCreated] = useState<Schemas["RevealedCredentialDto"] | null>(null);

  return (
    <Card as="section" padding="md" aria-labelledby="visitor-title" data-testid="visitor-code">
      <h2 id="visitor-title" className="font-semibold">
        {t("title")}
      </h2>
      <p className="text-muted mt-1 text-sm">{t("lead", { hours: maxHours })}</p>
      {created ? (
        <div className="mt-3 flex flex-col gap-1" role="status" data-testid="visitor-created">
          <p className="font-medium">{t("created", { name: created.holderName })}</p>
          <p className="font-mono text-3xl font-semibold tracking-[0.2em] tabular-nums">{created.pin}</p>
          <p className="text-muted text-sm">
            {t("valid", {
              from: formatDateTime(created.validFrom, locale),
              to: created.validTo ? formatDateTime(created.validTo, locale) : "—",
            })}
          </p>
        </div>
      ) : (
        <form
          className="mt-3 flex flex-col gap-3"
          noValidate
          onSubmit={async (event) => {
            event.preventDefault();
            if (!name.trim()) {
              setMissing(true);
              return;
            }
            setMissing(false);
            setBusy(true);
            setError(null);
            const now = Date.now();
            const body: VisitorCodeCreate = {
              unitId,
              visitorName: name.trim(),
              validFrom: new Date(now).toISOString(),
              validTo: new Date(now + hours * 3_600_000).toISOString(),
            };
            try {
              // CONTRACT-REQUEST #26 (docs/contract-requests.md).
              setCreated(
                await bffJson<Schemas["RevealedCredentialDto"]>("/v1/resident/access/visitor-codes", {
                  method: "POST",
                  body,
                }),
              );
            } catch (caught) {
              if (!isApiError(caught)) throw caught;
              setError(caught);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={t("name")} error={missing ? t("nameMissing") : undefined}>
            <Input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-testid="visitor-name" />
          </Field>
          <Field label={t("hours")}>
            <NativeSelect
              value={String(hours)}
              onChange={(e) => setHours(Number(e.target.value))}
              options={options.map((h) => ({ value: String(h), label: t("hoursOption", { count: h }) }))}
            />
          </Field>
          {error ? <ProblemCallout error={error} /> : null}
          <Button type="submit" size="lg" block variant="secondary" loading={busy} data-testid="visitor-submit">
            {t("submit")}
          </Button>
        </form>
      )}
    </Card>
  );
}
