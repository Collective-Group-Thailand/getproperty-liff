"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatDateTime } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { useIdempotentAttempt } from "@/lib/api/attempt";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { IssuedCredential, Schemas, VisitorPolicy } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { NativeSelect } from "@/ui/components/NativeSelect";
import { IconLock } from "@/ui/icons/glyphs/lock";

const HOURS = [2, 4, 8, 24];

/** The hours a resident may choose: the usual steps up to the operator's limit, and the limit itself. */
export function visitorHours(maxHours: number): number[] {
  if (maxHours <= 0) return [];
  const steps = HOURS.filter((h) => h < maxHours);
  return [...steps, maxHours];
}

/**
 * A time-boxed code for a visitor (D-070: visitors get time-boxed codes; D-218): `POST /v1/resident/access/visitor-codes`
 * from now for the chosen hours, never longer than the operator allows (`visitorPolicy.maxHours`). Residents may do
 * this only where the operator opted in (`access.resident_visitor_codes`, default off): otherwise — or when the API
 * answers 403 `access.visitor_codes_disabled` because the operator just turned it off — a friendly "not offered"
 * state. The code is shown once, big; the API keeps the record. One `Idempotency-Key` per visitor and length, with
 * the time window frozen with it (review M2): a retry after a dropped answer sends the very same body and gets the
 * same code back, for up to 10 minutes; after that "from now" is recomputed under a new key.
 */
export function VisitorCode({ unitId, policy }: { unitId: string; policy: VisitorPolicy }) {
  const t = useTranslations("resident.access.visitor");
  const current = useLocale();
  const locale = isLocale(current) ? current : "th";
  const options = visitorHours(policy.maxHours);
  const [disabled, setDisabled] = useState(!policy.allowed || options.length === 0);
  const [name, setName] = useState("");
  const [hours, setHours] = useState(options[0] ?? 0);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const attempt = useIdempotentAttempt<Schemas["ResidentVisitorCodeCreateDto"]>({ maxAgeMs: 10 * 60_000 });
  const [created, setCreated] = useState<IssuedCredential | null>(null);

  if (disabled) {
    return (
      <Card as="section" padding="md" data-testid="visitor-disabled">
        <EmptyState icon={IconLock} title={t("title")} description={t("notAllowed")} />
      </Card>
    );
  }

  return (
    <Card as="section" padding="md" aria-labelledby="visitor-title" data-testid="visitor-code">
      <h2 id="visitor-title" className="font-semibold">
        {t("title")}
      </h2>
      <p className="text-muted mt-1 text-sm">{t("lead", { hours: policy.maxHours })}</p>
      {created ? (
        <div className="mt-3 flex flex-col gap-1" role="status" data-testid="visitor-created">
          <p className="font-medium">{t("created", { name: created.holderName })}</p>
          <p className="font-mono text-3xl font-semibold tracking-[0.2em] tabular-nums" data-testid="visitor-pin">
            {created.pin}
          </p>
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
            try {
              const { key, body } = await attempt.prepare({ unitId, name: name.trim(), hours }, () => {
                const now = Date.now();
                return {
                  unitId,
                  visitorName: name.trim(),
                  validFrom: new Date(now).toISOString(),
                  validTo: new Date(now + hours * 3_600_000).toISOString(),
                };
              });
              setCreated(
                unwrap(
                  await browserApi.POST("/v1/resident/access/visitor-codes", {
                    params: { header: { "Idempotency-Key": key } },
                    body,
                  }),
                ),
              );
              attempt.succeeded();
            } catch (caught) {
              const problem = toApiError(caught);
              attempt.failed(problem);
              if (problem.code === "access.visitor_codes_disabled") setDisabled(true);
              else setError(problem);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={t("name")} error={missing ? t("nameMissing") : undefined}>
            <Input
              value={name}
              maxLength={80}
              onChange={(e) => {
                setName(e.target.value);
              }}
              data-testid="visitor-name"
            />
          </Field>
          <Field label={t("hours")}>
            <NativeSelect
              value={String(hours)}
              onChange={(e) => {
                setHours(Number(e.target.value));
              }}
              options={options.map((h) => ({ value: String(h), label: t("hoursOption", { count: h }) }))}
              data-testid="visitor-hours"
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
