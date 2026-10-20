"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { PhotoPicker, type PickedPhoto } from "@/features/shared/PhotoPicker";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { preparePhoto, putToPresigned, withRetry } from "@/features/shared/upload";
import { browserApi, unwrap } from "@/lib/api/browser";
import { isApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { IconRefresh } from "@/ui/icons/glyphs/refresh";
import { IconUpload } from "@/ui/icons/glyphs/upload";

const MAX = 10;

type Presigned = {
  fileId: string;
  uploadUrl: string;
  method: string;
  headers: Record<string, string>;
  expiresAt: string;
};

/**
 * One photo through the technician presign (`POST …/photos { role, contentType, sizeBytes, sha256 }`) and the PUT. A
 * presign that is still valid is reused on a retry, so a flaky connection does not attach the same photo twice.
 */
async function uploadWorkOrderPhoto(
  workOrderId: string,
  role: "before" | "after",
  file: Blob,
  cache: Map<Blob, Presigned & { photo: Blob }>,
): Promise<string> {
  let entry = cache.get(file);
  if (!entry || Date.parse(entry.expiresAt) < Date.now() + 60_000) {
    const { photo, contentType, sha256 } = await preparePhoto(file);
    const presign = unwrap(
      await browserApi.POST("/v1/technician/work-orders/{workOrderId}/photos", {
        params: { path: { workOrderId } },
        body: { role, contentType, sizeBytes: photo.size, sha256 },
      }),
    );
    entry = { ...presign, photo };
    cache.set(file, entry);
  }
  await putToPresigned({ ...entry, method: "PUT" }, entry.photo);
  cache.delete(file);
  return entry.fileId;
}

/**
 * Before / after photos of a work order (L4 4.4 §2): `CameraCapture` (multi-shot, compressed on the phone), then a
 * light retry queue — each photo is tried up to three times with backoff; what still fails stays queued with
 * "try sending again", and the queue is retried by itself when the phone comes back online. Not the staff PWA's
 * offline mode: a reload drops the queue (the photos are still in the phone's gallery).
 */
export function WorkOrderPhotos({ workOrderId, role }: { workOrderId: string; role: "before" | "after" }) {
  const t = useTranslations("technician.workOrders.photos");
  const router = useRouter();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [queued, setQueued] = useState<PickedPhoto[]>([]);
  const [progress, setProgress] = useState<{ index: number; count: number } | null>(null);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const busy = progress !== null;
  const sending = useRef(false);
  const presigned = useRef(new Map<Blob, Presigned & { photo: Blob }>());

  async function send(batch: PickedPhoto[]) {
    if (sending.current || batch.length === 0) return;
    sending.current = true;
    setError(null);
    const failed: PickedPhoto[] = [];
    let done = 0;
    for (const [index, photo] of batch.entries()) {
      setProgress({ index: index + 1, count: batch.length });
      try {
        await withRetry(() => uploadWorkOrderPhoto(workOrderId, role, photo.file, presigned.current));
        done += 1;
        URL.revokeObjectURL(photo.url);
      } catch (caught) {
        failed.push(photo);
        if (isApiError(caught) && caught.status > 0 && caught.status < 500 && caught.status !== 429) setError(caught);
      }
    }
    setProgress(null);
    setPhotos([]);
    setQueued(failed);
    setSent((n) => n + done);
    sending.current = false;
    if (done) router.refresh();
  }

  useEffect(() => {
    if (queued.length === 0) return;
    const retry = () => void send(queued);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
    // `send` reads the latest state through its arguments.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued]);

  return (
    <div className="flex flex-col gap-3" data-testid={`wo-photos-${role}`}>
      <p className="text-muted text-sm">{role === "before" ? t("beforeHint") : t("afterHint")}</p>
      <PhotoPicker
        photos={photos}
        onChange={setPhotos}
        max={MAX}
        disabled={busy}
        testId={`wo-picker-${role}`}
        labels={{
          add: t("add"),
          shoot: t("shoot"),
          shootHint: t("shootHint"),
          list: t("list"),
          photoAlt: (index) => t("photoAlt", { index }),
          remove: (index) => t("remove", { index }),
        }}
      />
      {photos.length ? (
        <Button
          size="lg"
          block
          iconStart={IconUpload}
          loading={busy}
          onClick={() => void send(photos)}
          data-testid={`wo-send-${role}`}
        >
          {t("send", { count: photos.length })}
        </Button>
      ) : null}
      <div aria-live="polite">
        {progress ? <p className="text-muted text-sm">{t("sending", progress)}</p> : null}
        {!progress && sent ? (
          <p className="text-success-subtle-fg text-sm font-medium" data-testid={`wo-sent-${role}`}>
            {t("sent", { count: sent })}
          </p>
        ) : null}
      </div>
      {queued.length ? (
        <div className="flex flex-col gap-2" data-testid={`wo-queue-${role}`}>
          <Callout tone="warning">{t("queued", { count: queued.length })}</Callout>
          <Button
            variant="secondary"
            size="lg"
            block
            iconStart={IconRefresh}
            loading={busy}
            onClick={() => void send(queued)}
          >
            {t("retry")}
          </Button>
        </div>
      ) : null}
      {error ? <ProblemCallout error={error} /> : null}
    </div>
  );
}
