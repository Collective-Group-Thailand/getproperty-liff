"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useIdempotentAttempt } from "@/lib/api/attempt";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { useCameraLabels } from "@/features/shared/useCameraLabels";
import { uploadResidentPhoto, withRetry } from "@/features/shared/upload";
import { Button } from "@/ui/components/Button";
import { CameraCapture } from "@/ui/components/CameraCapture";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { IconButton } from "@/ui/components/IconButton";
import { IconBack } from "@/ui/icons/glyphs/back";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClose } from "@/ui/icons/glyphs/close";
import { IconFlag } from "@/ui/icons/glyphs/flag";

const MAX_PHOTOS = 6;

type Mode = "choose" | "accept" | "dispute";

/**
 * The resident's answer to the proposed settlement (D-023): accept the refund the API proposes, or dispute it with
 * a reason and photos (`CameraCapture`; uploaded by presigned URL first, `POST /v1/resident/uploads`). Both POSTs carry an
 * `Idempotency-Key` per logical answer with its body frozen (review M2): a photo is uploaded once (its file id is
 * cached), and a retry of the same reason and photos sends the same body under the same key, so a dropped answer
 * never turns into `idempotency.key_reused` or a second answer.
 */
export function DepositResponse({
  depositId,
  refund,
  canAccept,
  canDispute,
}: {
  depositId: string;
  refund: string | null;
  canAccept: boolean;
  canDispute: boolean;
}) {
  const t = useTranslations("resident.deposit.respond");
  const cameraLabels = useCameraLabels();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choose");
  const [reason, setReason] = useState("");
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [reasonMissing, setReasonMissing] = useState(false);
  const accept = useIdempotentAttempt<null>();
  const dispute = useIdempotentAttempt<Schemas["ResidentDisputeDto"]>();
  /** Photo (its preview URL) → uploaded file id, so a second attempt does not upload it again. */
  const uploaded = useRef(new Map<string, string>());

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), [photos]);

  async function run(attempt: { succeeded(): void; failed(error: unknown): void }, action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      attempt.succeeded();
      router.refresh();
    } catch (caught) {
      const problem = toApiError(caught);
      attempt.failed(problem);
      setError(problem);
      // The answer may already be on file under another body: re-read the deposit (the page shows what the API has).
      if (problem.code === "idempotency.key_reused") router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (mode === "accept") {
    return (
      <Card as="section" padding="md" aria-labelledby="accept-title" data-testid="deposit-accept-confirm">
        <h2 id="accept-title" className="font-semibold">
          {t("acceptTitle")}
        </h2>
        <p className="mt-2">{refund ? t("acceptBody", { amount: refund }) : t("acceptBodyNoAmount")}</p>
        {error ? <ProblemCallout error={error} /> : null}
        <div className="mt-4 flex flex-col gap-2">
          <Button
            size="lg"
            block
            loading={busy}
            iconStart={IconCheckCircle}
            data-testid="deposit-accept-submit"
            onClick={() =>
              void run(accept, async () => {
                const { key } = await accept.prepare({ depositId, answer: "accept" }, () => null);
                unwrap(
                  await browserApi.POST("/v1/resident/deposits/{depositId}/actions/accept", {
                    params: { path: { depositId }, header: { "Idempotency-Key": key } },
                  }),
                );
              })
            }
          >
            {t("acceptSubmit")}
          </Button>
          <Button variant="ghost" size="lg" block iconStart={IconBack} onClick={() => setMode("choose")}>
            {t("back")}
          </Button>
        </div>
      </Card>
    );
  }

  if (mode === "dispute") {
    return (
      <form
        className="flex flex-col gap-4"
        data-testid="deposit-dispute-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim().length < 3) {
            setReasonMissing(true);
            return;
          }
          setReasonMissing(false);
          void run(dispute, async () => {
            const intent = { depositId, reason: reason.trim(), photos: photos.map((p) => p.url) };
            const { key, body } = await dispute.prepare(intent, async () => {
              const photoDocumentIds: string[] = [];
              for (const photo of photos) {
                let fileId = uploaded.current.get(photo.url);
                if (!fileId) {
                  const target = { purpose: "deposit_dispute", depositId } as const;
                  fileId = await withRetry(() => uploadResidentPhoto(photo.file, target));
                  uploaded.current.set(photo.url, fileId);
                }
                photoDocumentIds.push(fileId);
              }
              return { reason: reason.trim(), photoDocumentIds };
            });
            unwrap(
              await browserApi.POST("/v1/resident/deposits/{depositId}/actions/dispute", {
                params: { path: { depositId }, header: { "Idempotency-Key": key } },
                body,
              }),
            );
          });
        }}
      >
        <h2 className="font-semibold">{t("disputeTitle")}</h2>
        <p className="text-muted text-sm">{t("disputeLead")}</p>
        <Field label={t("reason")} error={reasonMissing ? t("reasonMissing") : undefined} required>
          <Textarea
            name="reason"
            rows={4}
            maxLength={1000}
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
            }}
            data-testid="deposit-dispute-reason"
          />
        </Field>
        <CameraCapture
          label={t("addPhoto")}
          hint={t("photoHint", { max: MAX_PHOTOS })}
          labels={cameraLabels}
          multiple
          maxShots={Math.max(1, MAX_PHOTOS - photos.length)}
          guide="none"
          fileBaseName="dispute"
          disabled={photos.length >= MAX_PHOTOS || busy}
          onCapture={(files) => {
            setPhotos((current) =>
              [...current, ...files.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS),
            );
          }}
        />
        {photos.length ? (
          <ul className="grid grid-cols-3 gap-2" role="list" aria-label={t("photos")} data-testid="deposit-photos">
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
        {error ? <ProblemCallout error={error} /> : null}
        <Button type="submit" size="lg" block loading={busy} iconStart={IconFlag} data-testid="deposit-dispute-submit">
          {t("disputeSubmit")}
        </Button>
        <Button type="button" variant="ghost" size="lg" block iconStart={IconBack} onClick={() => setMode("choose")}>
          {t("back")}
        </Button>
      </form>
    );
  }

  return (
    <section aria-labelledby="respond-title" className="flex flex-col gap-3" data-testid="deposit-respond">
      <h2 id="respond-title" className="font-semibold">
        {t("title")}
      </h2>
      <p className="text-muted text-sm">{t("lead")}</p>
      {canAccept ? (
        <Button
          size="lg"
          block
          iconStart={IconCheckCircle}
          onClick={() => setMode("accept")}
          data-testid="deposit-accept"
        >
          {refund ? t("accept", { amount: refund }) : t("acceptNoAmount")}
        </Button>
      ) : null}
      {canDispute ? (
        <Button
          variant="secondary"
          size="lg"
          block
          iconStart={IconFlag}
          onClick={() => setMode("dispute")}
          data-testid="deposit-dispute"
        >
          {t("dispute")}
        </Button>
      ) : null}
    </section>
  );
}
