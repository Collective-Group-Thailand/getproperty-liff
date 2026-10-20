"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { useCameraLabels } from "@/features/shared/useCameraLabels";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { SLIP_STATUS } from "@/domain/status/slip";
import { formatDateTime, formatTHB } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { newIdempotencyKey } from "@/lib/api/idempotency";
import { isApiError, type ApiError } from "@/lib/api/problem";
import { qk } from "@/lib/api/query-keys";
import type { ResidentPayment, SlipMimeType, SlipView } from "@/lib/api/types";
import { StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { CameraCapture } from "@/ui/components/CameraCapture";
import { Callout } from "@/ui/components/Callout";
import { Stepper } from "@/ui/components/Stepper";
import { IconBack } from "@/ui/icons/glyphs/back";
import { IconCamera } from "@/ui/icons/glyphs/camera";
import { IconImage } from "@/ui/icons/glyphs/image";
import { IconUpload } from "@/ui/icons/glyphs/upload";

import { CopyAccount } from "./CopyAccount";
import { prepareSlip, SLIP_ACCEPT, toBase64 } from "./slipFile";

/** While a slip waits for the check, its outcome is re-read this often (`slip.*` events refresh it sooner). */
export const SLIP_POLL_MS = 3_000;

type Chosen = { blob: Blob; mimeType: SlipMimeType; url: string | null; name: string };

const DECIDED = new Set(["auto_confirmed", "approved", "rejected", "duplicate"]);

/**
 * The slip fallback (L2 2.2 §2, D-043): paid by a plain transfer → choose the slip from the gallery (a bank app's
 * screenshot, sent as it is) or photograph a paper one (`CameraCapture`) → check it → send it inline to
 * `POST …/slips` with one `Idempotency-Key` per chosen file → follow the verification:
 * confirmed automatically, waiting for the office with the reasons (amount or account mismatch), a duplicate of a
 * slip sent before, or rejected — read from `GET …/slips` and announced as it changes.
 */
export function SlipPanel({
  invoiceId,
  payment,
  onBack,
}: {
  invoiceId: string;
  payment: ResidentPayment;
  onBack: () => void;
}) {
  const t = useTranslations("resident.pay.slip");
  const root = useTranslations();
  const current = useLocale();
  const locale = isLocale(current) ? current : "th";
  const cameraLabels = useCameraLabels();
  const galleryRef = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [problem, setProblem] = useState<"too_large" | "unsupported" | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);

  useEffect(
    () => () => {
      if (chosen?.url) URL.revokeObjectURL(chosen.url);
    },
    [chosen],
  );

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setCamera(false);
    const prepared = await prepareSlip(file);
    if (!prepared.ok) {
      setProblem(prepared.reason);
      return;
    }
    setProblem(null);
    setKey(newIdempotencyKey());
    setChosen({
      blob: prepared.blob,
      mimeType: prepared.mimeType,
      url: prepared.mimeType === "application/pdf" ? null : URL.createObjectURL(prepared.blob),
      name: file.name,
    });
  };

  const send = useMutation({
    mutationFn: async (slip: Chosen) =>
      unwrap(
        await browserApi.POST("/v1/resident/invoices/{invoiceId}/slips", {
          params: { path: { invoiceId } },
          body: { image: await toBase64(slip.blob), mimeType: slip.mimeType },
          // One key per chosen file: a retried tap on a flaky connection answers the first slip.
          headers: { "Idempotency-Key": key },
        }),
      ),
  });
  const sent = send.data;

  const slips = useQuery({
    queryKey: qk.resident.slips(invoiceId),
    queryFn: async () =>
      unwrap(await browserApi.GET("/v1/resident/invoices/{invoiceId}/slips", { params: { path: { invoiceId } } })),
    enabled: Boolean(sent),
    retry: false,
    refetchInterval: (query) => {
      if (query.state.error) return false;
      const mine = query.state.data?.data.find((slip) => slip.id === sent?.id);
      return mine && DECIDED.has(mine.status) ? false : SLIP_POLL_MS;
    },
  });
  const outcome: SlipView | null = sent
    ? (slips.data?.data.find((slip) => slip.id === sent.id) ?? {
        id: sent.id,
        status: sent.status,
        reasons: [],
        uploadedAt: sent.uploadedAt,
        decidedAt: null,
      })
    : null;
  const outcomeUnknown = Boolean(sent) && slips.isError;

  const step = outcome ? 2 : chosen ? 1 : 0;
  const steps = [
    { id: "choose", label: t("steps.choose") },
    { id: "check", label: t("steps.check") },
    { id: "send", label: t("steps.send") },
  ];
  const error: ApiError | null = send.error && isApiError(send.error) ? send.error : null;

  return (
    <div className="flex flex-col gap-4" data-testid="slip-panel">
      <Stepper
        steps={steps}
        current={step}
        label={t("stepsLabel")}
        progressText={t("stepOf", { step: step + 1, total: steps.length })}
      />

      {step === 0 ? (
        <>
          <p className="text-muted text-sm">{t("lead", { amount: formatTHB(payment.due, locale) })}</p>
          {payment.account ? (
            <p className="text-sm" data-testid="slip-account">
              {t("account", {
                bank: payment.account.bankNameTh,
                name: payment.account.accountName,
                account: payment.account.accountNo ?? payment.account.accountNoMasked,
              })}
              {payment.account.accountNo ? <CopyAccount accountNo={payment.account.accountNo} /> : null}
            </p>
          ) : null}
          {camera ? (
            <CameraCapture
              label={t("shoot")}
              hint={t("shootHint")}
              labels={cameraLabels}
              guide="document"
              fileBaseName="slip"
              compress={{ maxDimension: 2048, maxBytes: 1_200_000 }}
              onCapture={(files) => void choose(files[0])}
            />
          ) : (
            <>
              <input
                ref={galleryRef}
                type="file"
                accept={SLIP_ACCEPT}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                data-testid="slip-file"
                onChange={(event) => {
                  void choose(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <Button
                size="lg"
                block
                iconStart={IconImage}
                onClick={() => galleryRef.current?.click()}
                data-testid="slip-gallery"
              >
                {t("gallery")}
              </Button>
              <Button variant="secondary" size="lg" block iconStart={IconCamera} onClick={() => setCamera(true)}>
                {t("camera")}
              </Button>
            </>
          )}
          {problem ? (
            <Callout tone="warning" title={t(`problem.${problem}.title`)}>
              {t(`problem.${problem}.body`)}
            </Callout>
          ) : null}
          <Button
            variant="ghost"
            size="lg"
            block
            iconStart={IconBack}
            onClick={camera ? () => setCamera(false) : onBack}
          >
            {camera ? t("cancelCamera") : t("backToQr")}
          </Button>
        </>
      ) : null}

      {step === 1 && chosen ? (
        <>
          <p className="font-semibold">{t("checkTitle")}</p>
          <p className="text-muted text-sm">{t("checkBody", { amount: formatTHB(payment.due, locale) })}</p>
          {chosen.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:)
            <img
              src={chosen.url}
              alt={t("previewAlt")}
              className="border-border mx-auto max-h-80 w-auto rounded-lg border object-contain"
              data-testid="slip-preview"
            />
          ) : (
            <p className="border-border rounded-lg border p-3 text-sm break-all" data-testid="slip-preview">
              {t("pdf", { name: chosen.name })}
            </p>
          )}
          {error ? <ProblemCallout error={error} /> : null}
          <Button
            size="lg"
            block
            iconStart={IconUpload}
            loading={send.isPending}
            onClick={() => send.mutate(chosen)}
            data-testid="slip-send"
          >
            {t("send")}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            block
            disabled={send.isPending}
            onClick={() => {
              setChosen(null);
              send.reset();
            }}
          >
            {t("another")}
          </Button>
        </>
      ) : null}

      {outcome ? (
        <section aria-labelledby="slip-outcome-title" className="flex flex-col gap-3" data-testid="slip-outcome">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="slip-outcome-title" className="font-semibold">
              {t("outcomeTitle")}
            </h3>
            <span aria-live="polite" data-testid="slip-status" data-status={outcome.status}>
              <StatusBadge status={SLIP_STATUS[outcome.status]} label={root(SLIP_STATUS[outcome.status].labelKey)} />
            </span>
          </div>
          <p className="text-muted text-xs">{t("sentAt", { date: formatDateTime(outcome.uploadedAt, locale) })}</p>
          <SlipOutcome outcome={outcome} unknown={outcomeUnknown} />
          {outcome.status === "duplicate" || outcome.status === "rejected" ? (
            <Button
              variant="secondary"
              size="lg"
              block
              iconStart={IconImage}
              onClick={() => {
                setChosen(null);
                send.reset();
              }}
            >
              {t("another")}
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function SlipOutcome({ outcome, unknown }: { outcome: SlipView; unknown: boolean }) {
  const t = useTranslations("resident.pay.slip.outcome");
  switch (outcome.status) {
    case "pending_verification":
      return <p className="text-sm">{unknown ? t("pendingNoStatus") : t("pending")}</p>;
    case "auto_confirmed":
    case "approved":
      return (
        <Callout tone="success" title={t("confirmedTitle")}>
          {t("confirmedBody")}
        </Callout>
      );
    case "pending_review":
      return (
        <Callout tone="info" title={t("reviewTitle")}>
          <span className="block">{t("reviewBody")}</span>
          {outcome.reasons.length ? (
            <ul className="mt-2 list-disc ps-5" data-testid="slip-reasons">
              {outcome.reasons.map((reason) => (
                <li key={reason}>{t(`reasons.${reason}`)}</li>
              ))}
            </ul>
          ) : null}
        </Callout>
      );
    case "duplicate":
      return (
        <Callout tone="warning" title={t("duplicateTitle")}>
          {t("duplicateBody")}
        </Callout>
      );
    case "rejected":
      return (
        <Callout tone="danger" title={t("rejectedTitle")}>
          {t("rejectedBody")}
        </Callout>
      );
  }
}
