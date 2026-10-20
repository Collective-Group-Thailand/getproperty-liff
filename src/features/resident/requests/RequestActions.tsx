"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { bffJson, browserApi, unwrap } from "@/lib/api/browser";
import { isApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { LazyAlertDialog } from "@/ui/components/overlays";
import { toast } from "@/ui/components/Toast";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";
import { cn } from "@/ui/lib/cn";

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (done) void toast.success(done);
      router.refresh();
      return true;
    } catch (caught) {
      if (!isApiError(caught)) throw caught;
      setError(caught);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

/** Cancel before the work is assigned (`cancel` in `nextActions`), with a reason, after a confirmation. */
export function CancelRequest({ serviceRequestId }: { serviceRequestId: string }) {
  const t = useTranslations("resident.requests.cancel");
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { busy, error, run } = useRun();
  return (
    <>
      <Button
        variant="ghost"
        size="lg"
        block
        iconStart={IconXCircle}
        onClick={() => {
          setReason(t("reasonDefault"));
          setOpen(true);
        }}
        data-testid="request-cancel"
      >
        {t("action")}
      </Button>
      {error ? <ProblemCallout error={error} /> : null}
      <LazyAlertDialog
        open={open}
        onOpenChange={setOpen}
        title={t("title")}
        description={t("body")}
        confirmLabel={t("confirm")}
        cancelLabel={t("keep")}
        tone="destructive"
        loading={busy}
        confirmDisabled={reason.trim().length === 0}
        onConfirm={() =>
          void run(
            async () =>
              unwrap(
                await browserApi.POST("/v1/resident/service-requests/{serviceRequestId}/actions/cancel", {
                  params: { path: { serviceRequestId } },
                  body: { reason: reason.trim() },
                }),
              ),
            t("done"),
          ).then((ok) => ok && setOpen(false))
        }
      >
        <Field label={t("reason")}>
          <Textarea
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid="request-cancel-reason"
          />
        </Field>
      </LazyAlertDialog>
    </>
  );
}

/** CONTRACT-REQUEST #24 — the resident confirms the planned visit (`confirm-visit` in `nextActions`). */
export function ConfirmVisit({ serviceRequestId }: { serviceRequestId: string }) {
  const t = useTranslations("resident.requests.detail");
  const { busy, error, run } = useRun();
  return (
    <div className="mt-3 flex flex-col gap-2">
      <Button
        size="lg"
        block
        variant="secondary"
        iconStart={IconCheckCircle}
        loading={busy}
        data-testid="request-confirm-visit"
        onClick={() =>
          void run(
            () =>
              // CONTRACT-REQUEST #24 (docs/contract-requests.md).
              bffJson(`/v1/resident/service-requests/${encodeURIComponent(serviceRequestId)}/actions/confirm-visit`, {
                method: "POST",
              }),
            t("visitConfirmedToast"),
          )
        }
      >
        {t("confirmVisit")}
      </Button>
      {error ? <ProblemCallout error={error} /> : null}
    </div>
  );
}

/** Rate 1–5 with an optional comment once the work is done (`rate`); the rating closes the request (D-072). */
export function RateRequest({ serviceRequestId }: { serviceRequestId: string }) {
  const t = useTranslations("resident.requests.rate");
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [missing, setMissing] = useState(false);
  const { busy, error, run } = useRun();
  const groupId = useId();
  return (
    <Card as="section" padding="md" aria-labelledby={`${groupId}-title`} data-testid="request-rate">
      <h2 id={`${groupId}-title`} className="font-semibold">
        {t("title")}
      </h2>
      <p className="text-muted mt-1 text-sm">{t("lead")}</p>
      <form
        className="mt-3 flex flex-col gap-3"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (rating < 1) {
            setMissing(true);
            return;
          }
          setMissing(false);
          void run(
            async () =>
              unwrap(
                await browserApi.POST("/v1/resident/service-requests/{serviceRequestId}/actions/rate", {
                  params: { path: { serviceRequestId } },
                  body: { rating, comment: comment.trim() || null },
                }),
              ),
            t("done"),
          );
        }}
      >
        <fieldset aria-describedby={missing ? `${groupId}-missing` : undefined}>
          <legend className="mb-2 text-sm font-medium">{t("stars")}</legend>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <label key={value} className="relative">
                <input
                  type="radio"
                  name={`${groupId}-rating`}
                  value={value}
                  checked={rating === value}
                  onChange={() => setRating(value)}
                  className="peer sr-only"
                  data-testid={`request-star-${value}`}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "rounded-control flex size-12 items-center justify-center text-2xl",
                    "peer-focus-visible:outline-focus-ring peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                    value <= rating ? "text-primary" : "text-subtle",
                  )}
                >
                  {value <= rating ? "★" : "☆"}
                </span>
                <span className="sr-only">{t("star", { count: value })}</span>
              </label>
            ))}
          </div>
          {missing ? (
            <div id={`${groupId}-missing`} className="mt-2">
              <Callout tone="danger">{t("missing")}</Callout>
            </div>
          ) : null}
        </fieldset>
        <Field label={t("comment")}>
          <Textarea
            rows={3}
            maxLength={1000}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            data-testid="request-rate-comment"
          />
        </Field>
        {error ? <ProblemCallout error={error} /> : null}
        <Button type="submit" size="lg" block loading={busy} data-testid="request-rate-submit">
          {t("submit")}
        </Button>
      </form>
    </Card>
  );
}
