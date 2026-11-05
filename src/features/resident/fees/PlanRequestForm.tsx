"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { ActionDock } from "@/features/shared/Screen";
import { formatDate } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { useIdempotentAttempt } from "@/lib/api/attempt";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { PaymentPlan, Schemas } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Field } from "@/ui/components/Field";
import { IconButton } from "@/ui/components/IconButton";
import { Input, Textarea } from "@/ui/components/Input";
import { IconAdd } from "@/ui/icons/glyphs/add";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconRemove } from "@/ui/icons/glyphs/remove";

import {
  PLAN_MIN_INSTALMENTS,
  PLAN_NOTE_MAX,
  planBody,
  validatePlanDraft,
  type PlanDraft,
  type PlanDraftErrors,
} from "./model";

export interface PlanRequestFormProps {
  unitId: string;
  today: string;
  /** Called with the plan the API created (stories / tests); the page navigates to its record by default. */
  onCreated?: (plan: PaymentPlan) => void;
}

/**
 * Asking the juristic office to split what I owe on this unit into monthly instalments (D-325). The form checks what
 * the contract states (an integer from 2, a first due date after today); the office's own limits — at most
 * `juristic.plan_max_instalments` and a first instalment within its window — come back as the API's message at the
 * field (contract request #45). One `Idempotency-Key` per request, the body frozen for retries. `open_exists` points to
 * the plan already on file; `nothing_due` says there is nothing to split.
 */
export function PlanRequestForm({ unitId, today, onCreated }: PlanRequestFormProps) {
  const t = useTranslations("resident.fees.plans.form");
  const current = useLocale();
  const locale = isLocale(current) ? current : "th";
  const router = useRouter();
  const attempt = useIdempotentAttempt<Schemas["PaymentPlanRequestDto"]>();
  const [draft, setDraft] = useState<PlanDraft>({ instalments: "3", firstDueOn: "", note: "" });
  const [touched, setTouched] = useState<Partial<Record<keyof PlanDraft, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const summary = useRef<HTMLDivElement>(null);

  const errors: PlanDraftErrors = validatePlanDraft(draft, today);
  const shown = (field: keyof PlanDraft) => (submitted || touched[field] ? errors[field] : undefined);
  const message = (field: keyof PlanDraft): string | undefined => {
    const local = shown(field);
    if (local) return t(`errors.${field}.${local}`, { min: PLAN_MIN_INSTALMENTS, max: PLAN_NOTE_MAX });
    return error?.fieldError(field);
  };
  const set = (field: keyof PlanDraft, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    if (error?.fieldError(field)) setError(null);
  };
  const step = (delta: number) => {
    const value = Number.parseInt(draft.instalments, 10);
    const next = Number.isFinite(value) ? value + delta : PLAN_MIN_INSTALMENTS;
    set("instalments", String(Math.max(PLAN_MIN_INSTALMENTS, next)));
    setTouched((previous) => ({ ...previous, instalments: true }));
  };

  async function submit() {
    setSubmitted(true);
    if (Object.keys(errors).length) {
      summary.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const frozen = await attempt.prepare(draft, () => planBody(draft));
    try {
      const plan = unwrap(
        await browserApi.POST("/v1/resident/units/{unitId}/payment-plan-requests", {
          params: { path: { unitId }, header: { "Idempotency-Key": frozen.key } },
          body: frozen.body,
        }),
      );
      attempt.succeeded();
      if (onCreated) onCreated(plan);
      else router.push(`/units/${unitId}/payment-plans/${plan.id}?sent=1`);
    } catch (caught) {
      attempt.failed(caught);
      const problem = toApiError(caught);
      setError(problem);
      if (!problem.errors.length) summary.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  const invalid = submitted && Object.keys(errors).length > 0;
  const fieldErrorsFromApi = error && error.errors.length > 0;

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      data-testid="plan-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div ref={summary} tabIndex={-1} className="outline-none" aria-live="polite">
        {invalid ? (
          <div data-testid="plan-form-summary">
            <Callout tone="danger" title={t("fix")}>
              <ul className="list-disc ps-5">
                {(Object.keys(errors) as (keyof PlanDraft)[]).map((field) => (
                  <li key={field}>{message(field)}</li>
                ))}
              </ul>
            </Callout>
          </div>
        ) : error?.code === "payment_plan.open_exists" ? (
          <Callout
            tone="info"
            title={t("openExists")}
            action={
              <Button asChild variant="secondary" size="sm">
                <Link href={`/units/${unitId}/payment-plans`}>{t("toPlans")}</Link>
              </Button>
            }
          >
            {t("openExistsBody")}
          </Callout>
        ) : error?.code === "payment_plan.nothing_due" ? (
          <div data-testid="plan-nothing-due">
            <Callout tone="success" title={t("nothingDue")}>
              {t("nothingDueBody")}
            </Callout>
          </div>
        ) : error && !fieldErrorsFromApi ? (
          <ProblemCallout error={error} />
        ) : null}
      </div>

      <Field label={t("instalments")} hint={t("instalmentsHint")} error={message("instalments")}>
        <div className="flex items-center gap-2">
          <IconButton
            type="button"
            variant="secondary"
            size="lg"
            icon={IconRemove}
            label={t("less")}
            onClick={() => step(-1)}
            disabled={Number.parseInt(draft.instalments, 10) <= PLAN_MIN_INSTALMENTS}
          />
          <Input
            inputSize="lg"
            inputMode="numeric"
            className="w-24 text-center text-lg font-semibold tabular-nums"
            value={draft.instalments}
            onChange={(event) => set("instalments", event.target.value)}
            onBlur={() => setTouched((previous) => ({ ...previous, instalments: true }))}
            data-testid="plan-instalments"
          />
          <IconButton
            type="button"
            variant="secondary"
            size="lg"
            icon={IconAdd}
            label={t("more")}
            onClick={() => step(1)}
          />
          <span className="text-muted text-sm">{t("months")}</span>
        </div>
      </Field>

      <Field
        label={t("firstDue")}
        hint={t("firstDueHint", { today: formatDate(today, locale) })}
        error={message("firstDueOn")}
      >
        <Input
          type="date"
          inputSize="lg"
          min={today}
          value={draft.firstDueOn}
          onChange={(event) => set("firstDueOn", event.target.value)}
          onBlur={() => setTouched((previous) => ({ ...previous, firstDueOn: true }))}
          data-testid="plan-first-due"
        />
      </Field>

      <Field label={t("note")} hint={t("noteHint")} error={message("note")}>
        <Textarea
          value={draft.note}
          maxLength={PLAN_NOTE_MAX + 1}
          onChange={(event) => set("note", event.target.value)}
          onBlur={() => setTouched((previous) => ({ ...previous, note: true }))}
          data-testid="plan-note"
        />
      </Field>

      <p className="text-muted text-sm">{t("how")}</p>

      <ActionDock>
        <Button type="submit" size="xl" block loading={busy} iconEnd={IconForward} data-testid="plan-submit">
          {t("submit")}
        </Button>
      </ActionDock>
    </form>
  );
}
