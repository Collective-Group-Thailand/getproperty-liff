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
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { SegmentedControl } from "@/ui/components/SegmentedControl";
import { Icon } from "@/ui/icons";
import { IconCheck } from "@/ui/icons/glyphs/check";
import { IconSearch } from "@/ui/icons/glyphs/search";
import { cn } from "@/ui/lib/cn";

import {
  areaName,
  CONSENT_GONE,
  destinationBody,
  destinationFieldOf,
  destinationProblems,
  draftFrom,
  matchAreas,
  type DestinationDraft,
  type DestinationField,
  type DestinationMode,
  type PublicArea,
  type RelocationOffer,
} from "./model";

const option = (on: boolean) =>
  cn(
    "rounded-control flex min-h-12 w-full items-center gap-2 border px-3 text-start",
    on ? "border-primary bg-primary-subtle text-primary-subtle-fg font-semibold" : "border-border bg-surface",
  );

/**
 * Where I am moving to (D-299): an area or station of getproperty's public list, or a province (and district) for
 * places outside it, and the highest rent to show. Used only to show public listings there — the landlord I leave
 * never sees it, and it is erased when the offer closes or I stop. Formats are checked here, the rest by the API.
 */
export function DestinationForm({
  offer,
  areas,
  locale,
}: {
  offer: Pick<RelocationOffer, "id" | "destination">;
  areas: PublicArea[] | null;
  locale: Locale;
}) {
  const t = useTranslations("resident.relocation.destination");
  const router = useRouter();
  const [draft, setDraft] = useState<DestinationDraft>(() => {
    const initial = draftFrom(offer);
    return areas ? initial : { ...initial, mode: "place" };
  });
  const [query, setQuery] = useState("");
  const [invalid, setInvalid] = useState<Set<DestinationField>>(new Set());
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof DestinationDraft>(key: K, value: DestinationDraft[K]) => {
    setSaved(false);
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const chosen = areas?.find((a) => a.slug === draft.areaSlug) ?? null;
  const matches = areas ? matchAreas(areas, query, draft.areaSlug) : [];
  const fieldError = (field: DestinationField, message: string) => (invalid.has(field) ? message : undefined);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const problems = destinationProblems(draft);
    setInvalid(new Set(problems));
    if (problems.length > 0) return;
    setBusy(true);
    try {
      unwrap(
        await browserApi.PUT("/v1/resident/relocation-offers/{offerId}/destination", {
          params: { path: { offerId: offer.id } },
          body: destinationBody(draft),
        }),
      );
      setSaved(true);
      router.refresh();
    } catch (caught) {
      const problem = toApiError(caught);
      if (CONSENT_GONE.has(problem.code) || problem.code === "relocation.invalid_state") {
        router.refresh();
      }
      if (problem.status === 422 && problem.errors.some((e) => destinationFieldOf(e.path))) {
        setInvalid(
          new Set(problem.errors.map((e) => destinationFieldOf(e.path)).filter((f): f is DestinationField => !!f)),
        );
      } else {
        setError(problem);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate data-testid="relocation-destination-form">
      {areas ? (
        <SegmentedControl
          label={t("mode.label")}
          value={draft.mode}
          onValueChange={(next) => {
            set("mode", next as DestinationMode);
            setInvalid(new Set());
          }}
          options={[
            { value: "area", label: t("mode.area") },
            { value: "place", label: t("mode.place") },
          ]}
          size="lg"
          fullWidth
        />
      ) : (
        <Callout tone="neutral">{t("areasUnavailable")}</Callout>
      )}

      {draft.mode === "area" && areas ? (
        <fieldset className="flex min-w-0 flex-col gap-2" data-testid="relocation-area">
          <legend className="mb-1 text-sm font-medium">{t("area.label")}</legend>
          {chosen ? (
            <p
              className="flex items-center gap-2 font-medium"
              data-testid="relocation-area-chosen"
              data-slug={chosen.slug}
            >
              <Icon icon={IconCheck} className="text-primary shrink-0" />
              {areaName(chosen, locale)}
              {chosen.kind === "station" && chosen.line ? (
                <span className="text-muted text-sm font-normal">· {chosen.line}</span>
              ) : null}
            </p>
          ) : null}
          <Field
            label={t("area.search")}
            labelHidden
            hint={chosen ? t("area.change") : t("area.hint")}
            error={fieldError("areaSlug", t("area.required"))}
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
                placeholder={t("area.search")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                autoComplete="off"
                enterKeyHint="search"
                data-testid="relocation-area-search"
              />
            </div>
          </Field>
          {query.trim() ? (
            matches.length > 0 ? (
              <ul className="flex flex-col gap-2" role="list">
                {matches.map((area) => (
                  <li key={area.slug}>
                    <button
                      type="button"
                      className={option(false)}
                      onClick={() => {
                        set("areaSlug", area.slug);
                        setQuery("");
                        setInvalid((current) => new Set([...current].filter((f) => f !== "areaSlug")));
                      }}
                      data-testid="relocation-area-option"
                      data-slug={area.slug}
                    >
                      <span className="min-w-0 flex-1">{areaName(area, locale)}</span>
                      <span className="text-muted text-xs">
                        {area.kind === "station"
                          ? [t("area.station"), area.line].filter(Boolean).join(" · ")
                          : t("area.district")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted text-sm">{t("area.noMatch", { query: query.trim() })}</p>
            )
          ) : null}
        </fieldset>
      ) : (
        <fieldset className="flex min-w-0 flex-col gap-3" data-testid="relocation-place">
          <legend className="mb-1 text-sm font-medium">{t("place.label")}</legend>
          <Field
            label={t("place.province")}
            hint={t("place.provinceHint")}
            error={fieldError("province", t("place.required"))}
            required
          >
            <Input
              inputSize="lg"
              value={draft.province}
              maxLength={100}
              autoComplete="address-level1"
              onChange={(event) => set("province", event.target.value)}
              data-testid="relocation-province"
            />
          </Field>
          <Field
            label={t("place.district")}
            hint={t("place.districtHint")}
            error={fieldError("district", t("place.invalid"))}
          >
            <Input
              inputSize="lg"
              value={draft.district}
              maxLength={100}
              autoComplete="address-level2"
              onChange={(event) => set("district", event.target.value)}
              data-testid="relocation-district"
            />
          </Field>
        </fieldset>
      )}

      <Field label={t("budget.label")} hint={t("budget.hint")} error={fieldError("maxRent", t("budget.invalid"))}>
        <Input
          inputMode="decimal"
          inputSize="lg"
          value={draft.maxRent}
          maxLength={15}
          onChange={(event) => set("maxRent", event.target.value)}
          data-testid="relocation-budget"
        />
      </Field>

      {error ? <ProblemCallout error={error} /> : null}
      {saved ? (
        <div role="status" data-testid="relocation-destination-saved">
          <Callout tone="success">{t("saved")}</Callout>
        </div>
      ) : null}
      <Button type="submit" size="lg" block loading={busy} data-testid="relocation-destination-submit">
        {offer.destination ? t("update") : t("submit")}
      </Button>
    </form>
  );
}
