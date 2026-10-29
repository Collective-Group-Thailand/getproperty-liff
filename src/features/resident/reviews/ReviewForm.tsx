"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { LazyCheckbox, WhenNear } from "@/features/shared/WhenNear";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { useIdempotentAttempt } from "@/lib/api/attempt";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { cn } from "@/ui/lib/cn";

import { BODY_MAX, BODY_MIN, RATINGS, reviewProblems, submitBody, textLength, type ReviewField } from "./model";
import { StarShape } from "./Stars";

/**
 * Writing my review of the building (D-301): a rating 1–5 (native radios — arrows move, 48 px targets), the text
 * (10–2000 characters, no contact or account data — the API screens it, `review.personal_data`), and the box for the
 * `review.publish` text shown above it — **never pre-ticked**; its version is sent only when ticked now. Answers:
 * `review.not_eligible` (the first day), `review.consent_required` (the text changed: read again), `review.already_submitted`
 * (mine is shown), `review.personal_data` (at the text). One `Idempotency-Key` per review, its body frozen for retries.
 */
export function ReviewForm({
  leaseId,
  consentVersion,
  consentText,
  locale,
}: {
  leaseId: string;
  consentVersion: number;
  /** The `review.publish` text as the API returned it (rendered on the server), right above its box. */
  consentText: React.ReactNode;
  locale: Locale;
}) {
  const t = useTranslations("resident.reviews.form");
  const router = useRouter();
  const [rating, setRating] = useState<number | null>(null);
  const [body, setBody] = useState("");
  // The version I ticked — a newer text after a refresh un-ticks the box by itself (never pre-ticked, D-025).
  const [acceptedVersion, setAcceptedVersion] = useState<number | null>(null);
  const accepted = acceptedVersion === consentVersion;
  const [invalid, setInvalid] = useState<Set<ReviewField>>(new Set());
  const [personal, setPersonal] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const attempt = useIdempotentAttempt<Schemas["ReviewSubmitDto"]>();
  const length = textLength(body);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPersonal(false);
    const problems = reviewProblems({ rating, body }, accepted);
    setInvalid(new Set(problems));
    if (problems.length > 0) return;
    setBusy(true);
    let leaving = false;
    try {
      const payload = submitBody({ rating, body }, consentVersion, locale);
      const prepared = await attempt.prepare({ leaseId, ...payload }, () => payload);
      unwrap(
        await browserApi.POST("/v1/resident/leases/{leaseId}/review", {
          params: { path: { leaseId }, header: { "Idempotency-Key": prepared.key } },
          body: prepared.body,
        }),
      );
      attempt.succeeded();
      leaving = true;
      router.replace(`/lease/${leaseId}/review?sent=1`, { scroll: true });
      router.refresh();
    } catch (caught) {
      const problem = toApiError(caught);
      attempt.failed(problem);
      if (problem.code === "review.personal_data") {
        setPersonal(true);
      } else if (problem.code === "review.consent_required") {
        setAcceptedVersion(null);
        setNotice(t("consentChanged"));
        router.refresh();
      } else if (problem.code === "review.not_eligible") {
        const from = typeof problem.problem.reviewEligibleFrom === "string" ? problem.problem.reviewEligibleFrom : null;
        setNotice(
          from ? t("notEligibleFrom", { date: formatDate(from, locale, { style: "long" }) }) : t("notEligible"),
        );
        router.refresh();
      } else if (problem.code === "review.already_submitted") {
        leaving = true;
        router.replace(`/lease/${leaseId}/review`, { scroll: true });
        router.refresh();
      } else if (problem.status === 422 && problem.errors.length > 0) {
        setInvalid(
          new Set(
            problem.errors
              .map((e) => (e.path === "rating" || e.path === "body" ? (e.path as ReviewField) : null))
              .filter((f): f is ReviewField => f !== null),
          ),
        );
        if (!problem.errors.some((e) => e.path === "rating" || e.path === "body")) setError(problem);
      } else {
        setError(problem);
      }
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate data-testid="review-form">
      <fieldset
        className="flex flex-col gap-2"
        aria-describedby={invalid.has("rating") ? "review-rating-error" : undefined}
      >
        <legend className="mb-1 font-medium">{t("rating.label")}</legend>
        <div className="flex gap-1" data-testid="review-rating">
          {RATINGS.map((value) => (
            <label
              key={value}
              className={cn(
                "rounded-control flex size-12 cursor-pointer items-center justify-center",
                "has-[:focus-visible]:outline-focus-ring has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-solid",
              )}
            >
              <input
                type="radio"
                name="rating"
                value={value}
                checked={rating === value}
                onChange={() => {
                  setRating(value);
                  setInvalid((current) => new Set([...current].filter((f) => f !== "rating")));
                }}
                className="sr-only"
                aria-label={t("rating.value", { count: value })}
                data-testid={`review-rating-${value}`}
              />
              <StarShape filled={rating !== null && value <= rating} className="size-8" />
            </label>
          ))}
        </div>
        <p className="text-muted text-sm" aria-live="polite">
          {rating ? t(`rating.word.${rating}`) : t("rating.hint")}
        </p>
        {invalid.has("rating") ? (
          <div id="review-rating-error">
            <Callout tone="danger">{t("rating.required")}</Callout>
          </div>
        ) : null}
      </fieldset>

      <Field
        label={t("body.label")}
        hint={t("body.hint", { count: length, max: BODY_MAX })}
        error={
          personal
            ? t("body.personal")
            : invalid.has("body")
              ? t("body.length", { min: BODY_MIN, max: BODY_MAX })
              : undefined
        }
        required
      >
        <Textarea
          rows={6}
          maxLength={BODY_MAX}
          value={body}
          placeholder={t("body.placeholder")}
          onChange={(event) => {
            setBody(event.target.value);
            setPersonal(false);
          }}
          data-testid="review-body"
        />
      </Field>
      <Callout tone="neutral" title={t("rules.title")}>
        <span data-testid="review-rules">{t("rules.body")}</span>
      </Callout>

      {consentText}
      <div className="flex flex-col gap-1">
        {/* D-179: the Radix checkbox loads once it is on screen (below the consent text) — page ≤ 180 KB. */}
        <WhenNear fallbackClassName="h-16 w-full" margin="0px" testId="review-consent-slot">
          <LazyCheckbox
            label={t("consent.label", { version: consentVersion })}
            description={t("consent.hint")}
            checked={accepted}
            onCheckedChange={(checked) => {
              setAcceptedVersion(checked === true ? consentVersion : null);
              setInvalid((current) => new Set([...current].filter((f) => f !== "consent")));
            }}
            required
            data-testid="review-consent"
          />
        </WhenNear>
        {invalid.has("consent") ? <Callout tone="danger">{t("consent.required")}</Callout> : null}
      </div>

      {notice ? (
        <div role="status" data-testid="review-notice">
          <Callout tone="warning">{notice}</Callout>
        </div>
      ) : null}
      {error ? <ProblemCallout error={error} /> : null}
      <Button type="submit" size="lg" block loading={busy} data-testid="review-submit">
        {t("submit")}
      </Button>
      <p className="text-muted text-center text-sm">{t("moderation")}</p>
    </form>
  );
}
