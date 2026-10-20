"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { PhotoPicker, type PickedPhoto } from "@/features/shared/PhotoPicker";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { uploadResidentPhoto, withRetry } from "@/features/shared/upload";
import { browserApi, unwrap } from "@/lib/api/browser";
import { PREFERRED_VISITS, type PreferredVisit } from "@/lib/api/contract-requests";
import { newIdempotencyKey } from "@/lib/api/idempotency";
import { isApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { NativeSelect, type NativeSelectOption } from "@/ui/components/NativeSelect";
import { SegmentedControl } from "@/ui/components/SegmentedControl";
import { IconForward } from "@/ui/icons/glyphs/forward";

import { MAX_REQUEST_PHOTOS, RESIDENT_PRIORITIES } from "./model";

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
  categories: NativeSelectOption[];
}) {
  const t = useTranslations("resident.requests.new");
  const router = useRouter();
  const [categoryId, setCategoryId] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [description, setDescription] = useState("");
  const [visit, setVisit] = useState<PreferredVisit>("anytime");
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
      // CONTRACT-REQUEST #24: until the API takes a structured preferred time, the choice is written into the text the
      // office reads (the contract's DTO refuses unknown fields).
      const text =
        visit === "anytime"
          ? description.trim()
          : `${description.trim()}\n${t("preferredVisit")} ${t(`visit.${visit}`)}`;
      const created = unwrap(
        await browserApi.POST("/v1/resident/service-requests", {
          params: { header: { "Idempotency-Key": key } },
          body: { unitId, categoryId, priority, description: text, photoDocumentIds },
        }),
      );
      router.push(`/requests/${created.id}?sent=1`);
    } catch (caught) {
      setProgress(null);
      setBusy(false);
      if (isApiError(caught)) setError(caught);
      else throw caught;
    }
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate data-testid="request-form">
      {units.length > 1 ? (
        <Field label={t("unit")}>
          <NativeSelect
            name="unit"
            options={units}
            value={unitId}
            disabled={busy}
            onChange={(e) => router.replace(`/requests/new?unit=${encodeURIComponent(e.target.value)}`)}
            data-testid="request-unit"
          />
        </Field>
      ) : null}
      <Field label={t("category")} error={invalid.category ? t("categoryMissing") : undefined} required>
        <NativeSelect
          name="category"
          options={categories}
          placeholder={t("categoryPlaceholder")}
          value={categoryId}
          disabled={busy}
          onChange={(e) => {
            setCategoryId(e.target.value);
            changed();
          }}
          data-testid="request-category"
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">{t("urgency")}</legend>
        <SegmentedControl
          label={t("urgency")}
          size="lg"
          value={priority}
          options={RESIDENT_PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))}
          onValueChange={(value) => {
            setPriority(value as Priority);
            changed();
          }}
        />
        <p className="text-muted text-sm">{t("urgencyHint")}</p>
      </fieldset>
      <Field
        label={t("description")}
        hint={t("descriptionHint")}
        error={invalid.description ? t("descriptionMissing") : undefined}
        required
      >
        <Textarea
          name="description"
          rows={4}
          maxLength={1500}
          value={description}
          disabled={busy}
          onChange={(e) => {
            setDescription(e.target.value);
            changed();
          }}
          data-testid="request-description"
        />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">{t("photos")}</legend>
        <p className="text-muted text-sm">{t("photosHint", { max: MAX_REQUEST_PHOTOS })}</p>
        <PhotoPicker
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
      </fieldset>
      <Field label={t("preferredVisit")}>
        <NativeSelect
          name="visit"
          value={visit}
          disabled={busy}
          options={PREFERRED_VISITS.map((v) => ({ value: v, label: t(`visit.${v}`) }))}
          onChange={(e) => {
            setVisit(e.target.value as PreferredVisit);
            changed();
          }}
          data-testid="request-visit"
        />
      </Field>
      {progress ? (
        <p className="text-muted text-sm" aria-live="polite" data-testid="request-uploading">
          {t("uploading", progress)}
        </p>
      ) : null}
      {error ? <ProblemCallout error={error} /> : null}
      <Button type="submit" size="lg" block loading={busy} iconEnd={IconForward} data-testid="request-submit">
        {t("submit")}
      </Button>
    </form>
  );
}
