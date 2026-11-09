"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Suspense, useRef, useState } from "react";

import { ChoiceCards, ChoiceGroup, ChoiceTiles } from "@/features/shared/Choice";
import { PhotoPicker, type PickedPhoto } from "@/features/shared/PhotoPicker";
import { ActionDock } from "@/features/shared/Screen";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { uploadResidentPhoto, withRetry } from "@/features/shared/upload";
import { browserApi, unwrap } from "@/lib/api/browser";
import { newIdempotencyKey } from "@/lib/api/key";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { VISIT_PREFERENCES, type VisitPreference } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { Skeleton } from "@/ui/components/Skeleton";
import type { NativeSelectOption, NativeSelectProps } from "@/ui/components/NativeSelect";
import type { IconGlyph } from "@/ui/icons";
import { lazyWarm } from "@/ui/lib/lazy";
import { IconElectric } from "@/ui/icons/glyphs/electric";
import { IconMore } from "@/ui/icons/glyphs/more";
import { IconWater } from "@/ui/icons/glyphs/water";
import { IconWrench } from "@/ui/icons/glyphs/wrench";

import { IconBug, IconDoorOpen, IconRefrigerator, IconSnowflake, IconSprayCan } from "./categoryGlyphs";
import { MAX_REQUEST_PHOTOS, RESIDENT_PRIORITIES } from "./model";

/** The unit select shows only for a resident of several units: loaded only then (D-179: the form is near its budget). */
const NativeSelect = lazyWarm<NativeSelectProps>(() =>
  import("@/ui/components/NativeSelect").then((module) => module.NativeSelect),
);

/** The platform category keys' icons (D-072); a landlord's own category gets the wrench. */
const CATEGORY_ICONS: Record<string, IconGlyph> = {
  electrical: IconElectric,
  plumbing: IconWater,
  aircon: IconSnowflake,
  appliance: IconRefrigerator,
  structure: IconDoorOpen,
  pest: IconBug,
  cleaning: IconSprayCan,
  other: IconMore,
};

/** What the resident can write (the API accepts more; a short, focused report reads better for the technician). */
const MAX_DESCRIPTION = 500;

/** The time windows of "pick a time" (`VisitPreference` minus `anytime`). */
const WINDOWS = VISIT_PREFERENCES.filter((v) => v !== "anytime");

type Priority = (typeof RESIDENT_PRIORITIES)[number];

/**
 * Report a problem (L4 4.1 §1, D-072): unit (when I occupy several), category (the landlord's, with the API's ids),
 * urgency, what is wrong, photos (`PhotoPicker` → `POST /v1/resident/uploads` purpose `service_request` → PUT, each
 * with a light retry; an uploaded photo is not sent twice when the resident tries again) and a preferred visit time,
 * then `POST /v1/resident/service-requests` with one `Idempotency-Key` per attempt. Where the request goes (the
 * office, or the developer under warranty) is the API's decision and shows on the request page.
 */
export function NewRequestForm({
  unitId,
  units,
  categories,
}: {
  unitId: string;
  /** My units as options (shown only with more than one). */
  units: NativeSelectOption[];
  /** The landlord's categories with the platform key each maps to (for its icon). */
  categories: { value: string; label: string; key: string }[];
}) {
  const t = useTranslations("resident.requests.new");
  const common = useTranslations("common");
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [description, setDescription] = useState("");
  const [visit, setVisit] = useState<VisitPreference>("anytime");
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [invalid, setInvalid] = useState<{ category?: boolean; description?: boolean }>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ index: number; count: number } | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  /** Photo id → uploaded file id, so a second attempt does not upload a photo again. */
  const uploaded = useRef(new Map<string, string>());
  const changed = () => setKey(newIdempotencyKey());

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const missing = { category: !categoryId, description: description.trim().length < 3 };
    setInvalid(missing);
    if (missing.category || missing.description) return;
    setBusy(true);
    setError(null);
    try {
      const photoDocumentIds: string[] = [];
      for (const [index, photo] of photos.entries()) {
        setProgress({ index: index + 1, count: photos.length });
        let fileId = uploaded.current.get(photo.id);
        if (!fileId) {
          fileId = await withRetry(() => uploadResidentPhoto(photo.file, { purpose: "service_request", unitId }));
          uploaded.current.set(photo.id, fileId);
        }
        photoDocumentIds.push(fileId);
      }
      setProgress(null);
      const created = unwrap(
        await browserApi.POST("/v1/resident/service-requests", {
          params: { header: { "Idempotency-Key": key } },
          body: {
            unitId,
            categoryId,
            priority,
            description: description.trim(),
            photoDocumentIds,
            preferredVisit: visit,
          },
        }),
      );
      router.push(`/requests/${created.id}?sent=1`);
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-1 flex-col gap-7" onSubmit={submit} noValidate data-testid="request-form">
      {units.length > 1 ? (
        <Field label={t("unit")}>
          <Suspense fallback={<Skeleton className="h-12 w-full" />}>
            <NativeSelect
              name="unit"
              options={units}
              value={unitId}
              disabled={busy}
              onChange={(e) => router.replace(`/requests/new?unit=${encodeURIComponent(e.target.value)}`)}
              data-testid="request-unit"
            />
          </Suspense>
        </Field>
      ) : null}

      <ChoiceGroup
        legend={t("category")}
        required
        requiredLabel={common("required")}
        error={invalid.category ? t("categoryMissing") : undefined}
        testId="request-category"
      >
        {(describedBy) => (
          <ChoiceTiles
            name="category"
            value={categoryId}
            disabled={busy}
            describedBy={describedBy}
            options={categories.map((c) => ({
              value: c.value,
              label: c.label,
              icon: CATEGORY_ICONS[c.key] ?? IconWrench,
            }))}
            onChange={(value) => {
              setCategoryId(value);
              setInvalid((before) => ({ ...before, category: false }));
              changed();
            }}
          />
        )}
      </ChoiceGroup>

      <ChoiceGroup legend={t("urgency")} hint={t("urgencyHint")} testId="request-priority">
        {(describedBy) => (
          <ChoiceTiles
            name="priority"
            variant="chip"
            columns={3}
            value={priority}
            disabled={busy}
            describedBy={describedBy}
            options={RESIDENT_PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))}
            onChange={(value) => {
              setPriority(value as Priority);
              changed();
            }}
          />
        )}
      </ChoiceGroup>

      <Field
        label={<span className="text-base font-semibold">{t("description")}</span>}
        hint={
          <span className="flex justify-between gap-3">
            <span>{t("descriptionHint")}</span>
            <span className="shrink-0 tabular-nums" aria-hidden="true">
              {t("counter", { count: description.length, max: MAX_DESCRIPTION })}
            </span>
          </span>
        }
        error={invalid.description ? t("descriptionMissing") : undefined}
        required
        requiredLabel={common("required")}
      >
        <Textarea
          name="description"
          rows={4}
          maxLength={MAX_DESCRIPTION}
          value={description}
          disabled={busy}
          onChange={(e) => {
            setDescription(e.target.value);
            changed();
          }}
          data-testid="request-description"
        />
      </Field>

      <ChoiceGroup legend={t("photos")} hint={t("photosHint", { max: MAX_REQUEST_PHOTOS })}>
        {() => (
          <PhotoPicker
            variant="slots"
            photos={photos}
            max={MAX_REQUEST_PHOTOS}
            disabled={busy}
            testId="request-photos"
            onChange={(next) => {
              setPhotos(next);
              changed();
            }}
            labels={{
              add: t("addPhotos"),
              shoot: t("shoot"),
              shootHint: t("shootHint"),
              list: t("photos"),
              photoAlt: (index) => t("photoAlt", { index }),
              remove: (index) => t("removePhoto", { index }),
            }}
          />
        )}
      </ChoiceGroup>

      <ChoiceGroup legend={t("preferredVisit")} testId="request-visit">
        {(describedBy) => (
          <ChoiceCards
            name="visit"
            value={visit === "anytime" ? "anytime" : "window"}
            disabled={busy}
            describedBy={describedBy}
            options={[
              {
                value: "anytime",
                label: t("access.anytime"),
                hint: t("access.anytimeHint"),
                testId: "request-visit-anytime",
              },
              {
                value: "window",
                label: t("access.window"),
                hint: t("access.windowHint"),
                testId: "request-visit-window",
              },
            ]}
            onChange={(value) => {
              setVisit(value === "anytime" ? "anytime" : "morning");
              changed();
            }}
            detail={{
              window: (
                <ChoiceTiles
                  name="visitWindow"
                  variant="chip"
                  columns={3}
                  value={visit}
                  disabled={busy}
                  options={WINDOWS.map((v) => ({ value: v, label: t(`visit.${v}`), testId: `request-visit-${v}` }))}
                  onChange={(value) => {
                    setVisit(value as VisitPreference);
                    changed();
                  }}
                />
              ),
            }}
          />
        )}
      </ChoiceGroup>

      {progress ? (
        <p className="text-muted text-sm" aria-live="polite" data-testid="request-uploading">
          {t("uploading", progress)}
        </p>
      ) : null}
      {error ? <ProblemCallout error={error} /> : null}
      <ActionDock>
        <Button type="submit" size="lg" block loading={busy} data-testid="request-submit">
          {t("submit")}
        </Button>
      </ActionDock>
    </form>
  );
}
