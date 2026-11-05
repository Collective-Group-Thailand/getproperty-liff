"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { LazyAlertDialog } from "@/ui/components/overlays";

/**
 * Withdrawing my plan request while it waits for the office (D-325): a confirmation, then
 * `POST …/payment-plans/{id}/actions/withdraw`. An office that decided meanwhile answers `payment_plan.invalid_state`:
 * the page is read again and shows the decision.
 */
export function WithdrawPlan({ unitId, planId }: { unitId: string; planId: string }) {
  const t = useTranslations("resident.fees.plans.withdraw");
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await browserApi.POST("/v1/resident/units/{unitId}/payment-plans/{planId}/actions/withdraw", {
          params: { path: { unitId, planId } },
        }),
      );
      setConfirm(false);
      router.refresh();
    } catch (caught) {
      const problem = toApiError(caught);
      setConfirm(false);
      if (problem.code === "payment_plan.invalid_state") router.refresh();
      setError(problem);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <ProblemCallout error={error} /> : null}
      <Button variant="destructive" size="lg" block onClick={() => setConfirm(true)} data-testid="plan-withdraw">
        {t("cta")}
      </Button>
      <LazyAlertDialog
        open={confirm}
        onOpenChange={(open) => (open ? null : setConfirm(false))}
        title={t("title")}
        description={t("body")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        tone="destructive"
        loading={busy}
        onConfirm={() => void withdraw()}
      />
    </div>
  );
}
