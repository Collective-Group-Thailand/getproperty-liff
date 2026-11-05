"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { LazyAlertDialog } from "@/ui/components/overlays";

import { clock, secondsLeft } from "../visitors/model";

/**
 * Cancelling my SOS while the API still allows it (`cancellableUntil`, `gate.sos.cancel_seconds` 30): an outlined
 * destructive button with the seconds left, behind a confirmation (calling off an emergency is not a casual tap). When
 * the window closes the button goes away; a late tap is the API's 409 and the page is read again.
 */
export function SosCancel({ incidentId, until }: { incidentId: string; until: string }) {
  const t = useTranslations("resident.visitors.sos.status.cancel");
  const router = useRouter();
  const [left, setLeft] = useState(() => secondsLeft(until, Date.now()) ?? 0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = secondsLeft(until, Date.now()) ?? 0;
      setLeft(next);
      if (next === 0) window.clearInterval(timer);
    }, 500);
    return () => window.clearInterval(timer);
  }, [until]);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await browserApi.POST("/v1/resident/sos/{incidentId}/actions/cancel", {
          params: { path: { incidentId } },
          body: { reason: t("reason") },
        }),
      );
      setConfirm(false);
      router.refresh();
    } catch (caught) {
      const problem = toApiError(caught);
      setConfirm(false);
      setError(problem);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (left === 0 && !error) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="sos-cancel">
      {error ? <ProblemCallout error={error} /> : null}
      {left > 0 ? (
        <>
          <Button
            variant="destructive"
            size="lg"
            block
            onClick={() => setConfirm(true)}
            data-testid="sos-cancel-button"
          >
            {t("button")}
          </Button>
          <p className="text-muted text-center text-sm" data-testid="sos-cancel-left">
            {t("left", { time: clock(left) })}
          </p>
        </>
      ) : null}
      <LazyAlertDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("title")}
        description={t("body")}
        confirmLabel={t("confirm")}
        cancelLabel={t("keep")}
        tone="destructive"
        loading={busy}
        onConfirm={() => void cancel()}
      />
    </div>
  );
}
