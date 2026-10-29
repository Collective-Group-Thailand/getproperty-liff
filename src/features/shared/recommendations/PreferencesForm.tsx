"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Checkbox } from "@/ui/components/Checkbox";
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { NativeSelect } from "@/ui/components/NativeSelect";
import { Icon } from "@/ui/icons";
import { IconAdd } from "@/ui/icons/glyphs/add";
import { IconClose } from "@/ui/icons/glyphs/close";
import { IconSearch } from "@/ui/icons/glyphs/search";
import { cn } from "@/ui/lib/cn";

import {
  areaName,
  basePath,
  CONSENT_AGAIN,
  consentState,
  draftFrom,
  draftProblems,
  fieldOf,
  matchAreas,
  MAX_AREAS,
  MESSAGE_LANGUAGES,
  UNIT_KINDS,
  updateBody,
  type DraftField,
  type PreferencesDraft,
  type PublicArea,
  type Recommendations,
  type RecommendationsAudience,
  type UnitKind,
} from "./model";

const chip = (on: boolean) =>
  cn(
    "rounded-control flex min-h-12 items-center gap-2 border px-3 text-start",
    on ? "border-primary bg-primary-subtle text-primary-subtle-fg font-semibold" : "border-border bg-surface",
  );

/**
 * What I want to hear about (D-300 (2)): areas, budget, kinds of place, move-in window, language and my own quiet
 * hours — the only fields the API stores. While I have not consented (or the text changed), the consent box is shown
 * **unticked** and the save needs it; its version is sent as `consentVersion` only when ticked now. Loaded as it comes
 * near the screen (D-179).
 */
export function PreferencesForm({
  audience,
  data,
  areas,
  locale,
}: {
  audience: RecommendationsAudience;
  data: Recommendations;
  areas: PublicArea[] | null;
  locale: Locale;
}) {
  const t = useTranslations("recommendations");
  const names = useTranslations("shell.languageNames");
  const router = useRouter();
  const state = consentState(data.consent);
  const needsConsent = state !== "on";
  const [draft, setDraft] = useState<PreferencesDraft>(() => draftFrom(data, locale));
  const [query, setQuery] = useState("");
  // The version I ticked — a newer text (after a refresh) un-ticks it by itself (never pre-ticked, D-300).
  const [acceptedVersion, setAcceptedVersion] = useState<number | null>(null);
  const accepted = acceptedVersion === data.consent.version;
  const [missingConsent, setMissingConsent] = useState(false);
  const [changed, setChanged] = useState(false);
  const [invalid, setInvalid] = useState<Set<DraftField>>(new Set());
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof PreferencesDraft>(key: K, value: PreferencesDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const bySlug = new Map((areas ?? []).map((area) => [area.slug, area]));
  const matches = areas ? matchAreas(areas, query, draft.areas) : [];
  const full = draft.areas.length >= MAX_AREAS;

  function toggleKind(kind: UnitKind) {
    set(
      "unitKinds",
      draft.unitKinds.includes(kind) ? draft.unitKinds.filter((k) => k !== kind) : [...draft.unitKinds, kind],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setChanged(false);
    const problems = draftProblems(draft);
    setInvalid(new Set(problems));
    const consentMissing = needsConsent && !accepted;
    setMissingConsent(consentMissing);
    if (problems.length > 0 || consentMissing) return;
    setBusy(true);
    let leaving = false;
    try {
      const body = updateBody(draft, needsConsent ? acceptedVersion : null);
      unwrap(
        audience === "resident"
          ? await browserApi.PUT("/v1/resident/me/recommendations", { body })
          : await browserApi.PUT("/v1/prospect/me/recommendations", { body }),
      );
      leaving = true;
      router.replace(`${basePath(audience)}?saved=1`, { scroll: true });
      router.refresh();
    } catch (caught) {
      const problem = toApiError(caught);
      if (CONSENT_AGAIN.has(problem.code)) {
        // The text changed (or I withdrew elsewhere): read it again — the new version comes with the refresh.
        setAcceptedVersion(null);
        setChanged(true);
        router.refresh();
      } else if (problem.status === 422 && problem.errors.some((e) => fieldOf(e.path))) {
        setInvalid(new Set(problem.errors.map((e) => fieldOf(e.path)).filter((f): f is DraftField => f !== null)));
      } else {
        setError(problem);
      }
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  const fieldError = (field: DraftField, message: string) => (invalid.has(field) ? message : undefined);

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate data-testid="recommendations-form">
      <Card as="section" padding="md" aria-labelledby="recommendations-form-title" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 id="recommendations-form-title" className="text-lg font-semibold">
            {t("form.title")}
          </h2>
          <p className="text-muted text-sm">{t("form.lead")}</p>
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2" data-testid="recommendations-areas">
          <legend className="mb-1 text-sm font-medium">{t("form.areas.label")}</legend>
          {draft.areas.length > 0 ? (
            <ul className="flex flex-wrap gap-2" role="list" aria-label={t("form.areas.chosen")}>
              {draft.areas.map((slug) => {
                const area = bySlug.get(slug);
                const name = area ? areaName(area, locale) : slug;
                return (
                  <li key={slug}>
                    <button
                      type="button"
                      className={chip(true)}
                      aria-label={t("form.areas.remove", { name })}
                      onClick={() =>
                        set(
                          "areas",
                          draft.areas.filter((s) => s !== slug),
                        )
                      }
                      data-testid="recommendations-area-chosen"
                      data-slug={slug}
                    >
                      <span>{name}</span>
                      <Icon icon={IconClose} className="shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {areas ? (
            <Field
              label={t("form.areas.search")}
              labelHidden
              hint={full ? t("form.areas.full", { max: MAX_AREAS }) : t("form.areas.hint", { max: MAX_AREAS })}
              error={fieldError("areas", t("form.areas.invalid"))}
            >
              <div className="relative">
                <Icon
                  icon={IconSearch}
                  className="text-muted pointer-events-none absolute start-3 top-1/2 -translate-y-1/2"
                />
                <Input
                  type="search"
                  inputSize="lg"
                  className="ps-10"
                  placeholder={t("form.areas.search")}
                  value={query}
                  disabled={full}
                  onChange={(event) => setQuery(event.target.value)}
                  autoComplete="off"
                  enterKeyHint="search"
                  data-testid="recommendations-area-search"
                />
              </div>
            </Field>
          ) : (
            <Callout tone="neutral">{t("form.areas.unavailable")}</Callout>
          )}
          {query.trim() && !full ? (
            matches.length > 0 ? (
              <ul className="flex flex-col gap-2" role="list">
                {matches.map((area) => (
                  <li key={area.slug}>
                    <button
                      type="button"
                      className={cn(chip(false), "w-full")}
                      onClick={() => {
                        set("areas", [...draft.areas, area.slug]);
                        setQuery("");
                      }}
                      data-testid="recommendations-area-option"
                      data-slug={area.slug}
                    >
                      <Icon icon={IconAdd} className="text-primary shrink-0" />
                      <span className="min-w-0 flex-1">{areaName(area, locale)}</span>
                      <span className="text-muted text-xs">
                        {area.kind === "station"
                          ? [t("form.areas.station"), area.line].filter(Boolean).join(" · ")
                          : t("form.areas.district")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted text-sm">{t("form.areas.noMatch", { query: query.trim() })}</p>
            )
          ) : null}
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t("form.budget.label")}</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("form.budget.from")} error={fieldError("budgetMin", t("form.budget.invalid"))}>
              <Input
                inputMode="decimal"
                inputSize="lg"
                value={draft.budgetMin}
                onChange={(event) => set("budgetMin", event.target.value)}
                data-testid="recommendations-budget-min"
              />
            </Field>
            <Field
              label={t("form.budget.to")}
              error={fieldError(
                "budgetMax",
                draftProblems(draft).includes("budgetMax") ? t("form.budget.invalid") : t("form.budget.range"),
              )}
            >
              <Input
                inputMode="decimal"
                inputSize="lg"
                value={draft.budgetMax}
                onChange={(event) => set("budgetMax", event.target.value)}
                data-testid="recommendations-budget-max"
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t("form.kinds.label")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {UNIT_KINDS.map((kind) => {
              const on = draft.unitKinds.includes(kind);
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={on}
                  className={chip(on)}
                  onClick={() => toggleKind(kind)}
                  data-testid="recommendations-kind"
                  data-kind={kind}
                >
                  {t(`form.kinds.${kind}`)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t("form.moveIn.label")}</legend>
          <div className="flex flex-col gap-3">
            <Field label={t("form.moveIn.from")} error={fieldError("moveInFrom", t("form.moveIn.invalid"))}>
              <Input
                type="date"
                inputSize="lg"
                value={draft.moveInFrom}
                onChange={(event) => set("moveInFrom", event.target.value)}
                data-testid="recommendations-move-in-from"
              />
            </Field>
            <Field label={t("form.moveIn.to")} error={fieldError("moveInTo", t("form.moveIn.invalid"))}>
              <Input
                type="date"
                inputSize="lg"
                value={draft.moveInTo}
                min={draft.moveInFrom || undefined}
                onChange={(event) => set("moveInTo", event.target.value)}
                data-testid="recommendations-move-in-to"
              />
            </Field>
          </div>
        </fieldset>

        <Field label={t("form.language.label")} hint={t("form.language.hint")}>
          <NativeSelect
            inputSize="lg"
            value={draft.language}
            options={MESSAGE_LANGUAGES.map((language) => ({ value: language, label: names(language) }))}
            onChange={(event) => set("language", event.target.value as PreferencesDraft["language"])}
            data-testid="recommendations-language"
          />
        </Field>

        <fieldset className="flex min-w-0 flex-col gap-3">
          <legend className="mb-1 text-sm font-medium">{t("form.quiet.label")}</legend>
          <Field label={t("form.quiet.label")} labelHidden>
            <NativeSelect
              inputSize="lg"
              value={draft.quietOwn ? "own" : "default"}
              options={[
                {
                  value: "default",
                  label: t("form.quiet.default", { start: data.quietHours.start, end: data.quietHours.end }),
                },
                { value: "own", label: t("form.quiet.own") },
              ]}
              onChange={(event) => set("quietOwn", event.target.value === "own")}
              data-testid="recommendations-quiet-mode"
            />
          </Field>
          {draft.quietOwn ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("form.quiet.from")} error={fieldError("quietHours", t("form.quiet.invalid"))}>
                <Input
                  type="time"
                  inputSize="lg"
                  value={draft.quietStart}
                  onChange={(event) => set("quietStart", event.target.value)}
                  data-testid="recommendations-quiet-start"
                />
              </Field>
              <Field label={t("form.quiet.to")}>
                <Input
                  type="time"
                  inputSize="lg"
                  value={draft.quietEnd}
                  onChange={(event) => set("quietEnd", event.target.value)}
                  data-testid="recommendations-quiet-end"
                />
              </Field>
            </div>
          ) : null}
        </fieldset>
      </Card>

      {needsConsent ? (
        <Card as="section" padding="md" className="flex flex-col gap-3" data-testid="recommendations-accept-card">
          <Checkbox
            label={t("consent.accept", { version: data.consent.version })}
            checked={accepted}
            onCheckedChange={(checked) => {
              setAcceptedVersion(checked === true ? data.consent.version : null);
              if (checked === true) setMissingConsent(false);
            }}
            data-testid="recommendations-accept"
          />
          {missingConsent ? <Callout tone="warning">{t("consent.required")}</Callout> : null}
        </Card>
      ) : null}

      {changed ? (
        <Callout tone="warning" title={t("consent.changed.title")}>
          {t("consent.changed.body")}
        </Callout>
      ) : null}
      {invalid.size > 0 ? <Callout tone="warning">{t("form.check")}</Callout> : null}
      {error ? <ProblemCallout error={error} /> : null}

      <Button type="submit" size="lg" block loading={busy} data-testid="recommendations-submit">
        {needsConsent ? t("form.submitOff") : t("form.submitOn")}
      </Button>
    </form>
  );
}
