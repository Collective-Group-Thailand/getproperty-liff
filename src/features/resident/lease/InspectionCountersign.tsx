"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { uploadResidentPhoto, withRetry } from "@/features/shared/upload";
import { useCameraLabels } from "@/features/shared/useCameraLabels";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { CameraCapture } from "@/ui/components/CameraCapture";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { IconButton } from "@/ui/components/IconButton";
import { Textarea } from "@/ui/components/Input";
import { Skeleton } from "@/ui/components/Skeleton";
import { toast } from "@/ui/components/Toast";
import { lazyWarm } from "@/ui/lib/lazy";
import { IconClose } from "@/ui/icons/glyphs/close";
import { IconSign } from "@/ui/icons/glyphs/sign";

import { fitPng, SIGNATURE_MAX_BYTES } from "./signatureImage";

const MAX_PHOTOS = 6;

// The drawing pad loads with the first interaction (D-179 budget): the report itself is what the page opens on.
const SignaturePad = lazyWarm(() => import("@/ui/components/SignaturePad").then((m) => m.SignaturePad));

/**
 * I countersign the report the landlord completed (L5 5.2, D-253): after reading the lines and photos above, draw a
 * signature (or use a photo of it) and send it; the report becomes "signed by both" and the landlord hears it. What I
 * see differently goes with my signature — a note and up to 6 photos of my own (D-266), kept with the report and shown
 * beside it at move-out.
 */
export function InspectionCountersign({ inspectionId }: { inspectionId: string }) {
  const t = useTranslations("resident.lease.inspections.countersign");
  const draw = useTranslations("resident.lease.sign.draw");
  const router = useRouter();
  const [signature, setSignature] = useState<Blob | null>(null);
  const [tooLarge, setTooLarge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const cameraLabels = useCameraLabels();
  /** Photo (its preview URL) → uploaded file id, so a retry does not upload it again. */
  const uploaded = useRef(new Map<string, string>());

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  async function send() {
    if (!signature) return;
    setBusy(true);
    setError(null);
    try {
      const { blobToBase64 } = await import("@/ui/components/SignaturePad");
      const photoDocumentIds: string[] = [];
      for (const photo of photos) {
        let fileId = uploaded.current.get(photo.url);
        if (!fileId) {
          const target = { purpose: "inspection_note", inspectionId } as const;
          fileId = await withRetry(() => uploadResidentPhoto(photo.file, target));
          uploaded.current.set(photo.url, fileId);
        }
        photoDocumentIds.push(fileId);
      }
      unwrap(
        await browserApi.POST("/v1/resident/inspections/{inspectionId}/actions/countersign", {
          params: { path: { inspectionId } },
          body: {
            signaturePng: await blobToBase64(signature),
            note: note.trim() || null,
            photoDocumentIds,
          },
        }),
      );
      toast.success(t("done"));
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      as="section"
      padding="md"
      aria-labelledby="inspection-sign"
      className="flex flex-col gap-4"
      data-testid="inspection-countersign"
    >
      <div className="flex flex-col gap-1">
        <h2 id="inspection-sign" className="font-semibold">
          {t("title")}
        </h2>
        <p className="text-muted text-sm">{t("lead")}</p>
      </div>
      <Field label={t("note")} hint={t("noteHint")}>
        <Textarea
          name="note"
          rows={3}
          maxLength={1000}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          data-testid="inspection-note"
        />
      </Field>
      <CameraCapture
        label={t("addPhoto")}
        hint={t("photoHint", { max: MAX_PHOTOS })}
        labels={cameraLabels}
        multiple
        maxShots={Math.max(1, MAX_PHOTOS - photos.length)}
        guide="none"
        fileBaseName="inspection-note"
        disabled={photos.length >= MAX_PHOTOS || busy}
        onCapture={(files) =>
          setPhotos((current) =>
            [...current, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS),
          )
        }
      />
      {photos.length ? (
        <ul
          className="grid grid-cols-3 gap-2"
          role="list"
          aria-label={t("photos")}
          data-testid="inspection-note-photos"
        >
          {photos.map((photo, index) => (
            <li key={photo.url} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:) */}
              <img
                src={photo.url}
                alt={t("photoAlt", { index: index + 1 })}
                width={96}
                height={96}
                className="rounded-control border-border aspect-square w-full border object-cover"
              />
              <IconButton
                icon={IconClose}
                label={t("removePhoto", { index: index + 1 })}
                size="sm"
                variant="secondary"
                className="absolute top-1 right-1"
                onClick={() => {
                  URL.revokeObjectURL(photo.url);
                  setPhotos((current) => current.filter((p) => p.url !== photo.url));
                }}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <Suspense fallback={<Skeleton className="h-60 w-full" />}>
        <SignaturePad
          label={draw("label")}
          labels={{
            placeholder: draw("placeholder"),
            clear: draw("clear"),
            undo: draw("undo"),
            upload: draw("upload"),
          }}
          onChange={async (png) => {
            setTooLarge(false);
            if (!png) {
              setSignature(null);
              return;
            }
            const fitted = await fitPng(png, SIGNATURE_MAX_BYTES);
            setTooLarge(!fitted);
            setSignature(fitted);
          }}
        />
      </Suspense>
      {tooLarge ? <Callout tone="warning">{draw("tooLarge")}</Callout> : null}
      {error ? <ProblemCallout error={error} /> : null}
      <Button
        size="lg"
        block
        iconStart={IconSign}
        loading={busy}
        disabled={!signature}
        onClick={() => void send()}
        data-testid="inspection-countersign-send"
      >
        {t("send")}
      </Button>
    </Card>
  );
}
