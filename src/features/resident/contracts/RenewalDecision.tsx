"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useIdempotentAttempt } from "@/lib/api/attempt";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { LazyAlertDialog } from "@/ui/components/overlays";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

const REASON_MAX = 500;

/**
 * Answering an offer to renew (GL3, D-294) — the actions the API offers (`nextActions`: `accept`, `decline`):
 *
 * - **accept** after a confirmation that restates the terms → `POST …/actions/accept`; the API drafts the renewal lease
 *   and sends it for my signature at once (the page then links to it). A `compliance.*` refusal (the owner must
 *   acknowledge the terms first) is shown with its legal reference and the offer stays open;
 * - **decline** with what follows spelled out (`consequence`, from the page: the end date and the move-out notice the
 *   API records, D-219) and an optional reason → `POST …/actions/decline`.
 *
 * One `Idempotency-Key` per answer, its body frozen for retries (D-229); the page reloads from the API afterwards.
 */
export function RenewalDecision({
  offerId,
  actions,
  terms,
  consequence,
}: {
  offerId: string;
  actions: string[];
  /** The confirmation's restatement of the offer (rent, months, start), formatted on the server. */
  terms: string;
  consequence: string;
}) {
  const t = useTranslations("resident.contracts.renewal");
  const router = useRouter();
  const [confirmAccept, setConfirmAccept] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const acceptAttempt = useIdempotentAttempt<null>();
  const declineAttempt = useIdempotentAttempt<{ reason: string | null }>();
  const path = { offerId };

  async function accept() {
    setBusy("accept");
    setError(null);
    try {
      const { key } = await acceptAttempt.prepare({ offerId, answer: "accept" }, () => null);
      unwrap(
        await browserApi.POST("/v1/resident/renewal-offers/{offerId}/actions/accept", {
          params: { path, header: { "Idempotency-Key": key } },
        }),
      );
      acceptAttempt.succeeded();
      setConfirmAccept(false);
      router.refresh();
    } catch (caught) {
      const problem = toApiError(caught);
      acceptAttempt.failed(problem);
      setConfirmAccept(false);
      setError(problem);
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    setError(null);
    try {
      const text = reason.trim() || null;
      const { key, body } = await declineAttempt.prepare({ offerId, answer: "decline", reason: text }, () => ({
        reason: text,
      }));
      unwrap(
        await browserApi.POST("/v1/resident/renewal-offers/{offerId}/actions/decline", {
          params: { path, header: { "Idempotency-Key": key } },
          body,
        }),
      );
      declineAttempt.succeeded();
      router.refresh();
    } catch (caught) {
      const problem = toApiError(caught);
      declineAttempt.failed(problem);
      setError(problem);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="renewal-decision">
      {error ? <ProblemCallout error={error} /> : null}
      {declining ? (
        <Card as="section" aria-labelledby="renewal-decline-title" padding="md" data-testid="renewal-decline-form">
          <h2 id="renewal-decline-title" className="font-semibold">
            {t("decline.title")}
          </h2>
          <p className="mt-1 text-sm" data-testid="renewal-decline-consequence">
            {consequence}
          </p>
          <div className="mt-3">
            <Field label={t("decline.reason")} hint={t("decline.reasonHint")}>
              <Textarea
                value={reason}
                maxLength={REASON_MAX}
                onChange={(event) => setReason(event.target.value)}
                data-testid="renewal-decline-reason"
              />
            </Field>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Button
              variant="destructive"
              size="lg"
              block
              loading={busy === "decline"}
              disabled={busy !== null}
              iconStart={IconXCircle}
              onClick={() => void decline()}
              data-testid="renewal-decline-confirm"
            >
              {t("decline.confirm")}
            </Button>
            <Button variant="ghost" size="lg" block disabled={busy !== null} onClick={() => setDeclining(false)}>
              {t("decline.keep")}
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {actions.includes("accept") ? (
            <Button
              size="lg"
              block
              iconStart={IconCheckCircle}
              disabled={busy !== null}
              onClick={() => {
                setError(null);
                setConfirmAccept(true);
              }}
              data-testid="renewal-accept"
            >
              {t("accept.cta")}
            </Button>
          ) : null}
          {actions.includes("decline") ? (
            <Button
              variant="secondary"
              size="lg"
              block
              disabled={busy !== null}
              onClick={() => {
                setError(null);
                setDeclining(true);
              }}
              data-testid="renewal-decline"
            >
              {t("decline.cta")}
            </Button>
          ) : null}
        </div>
      )}
      <LazyAlertDialog
        open={confirmAccept}
        onOpenChange={(open) => (open ? null : setConfirmAccept(false))}
        title={t("accept.title")}
        description={t("accept.body", { terms })}
        confirmLabel={t("accept.confirm")}
        cancelLabel={t("accept.cancel")}
        loading={busy === "accept"}
        onConfirm={() => void accept()}
      />
    </div>
  );
}
