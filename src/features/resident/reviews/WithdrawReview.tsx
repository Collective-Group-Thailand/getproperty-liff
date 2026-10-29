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
 * Taking my review down for good (D-301 (5)): after a confirmation that says the text is erased at once and this lease
 * cannot be reviewed again → `POST …/review/actions/withdraw` (repeating it answers the same).
 */
export function WithdrawReview({ leaseId }: { leaseId: string }) {
  const t = useTranslations("resident.reviews.withdraw");
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await browserApi.POST("/v1/resident/leases/{leaseId}/review/actions/withdraw", {
          params: { path: { leaseId } },
        }),
      );
      setConfirm(false);
      router.refresh();
    } catch (caught) {
      setConfirm(false);
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <ProblemCallout error={error} /> : null}
      <Button variant="destructive" size="lg" block onClick={() => setConfirm(true)} data-testid="review-withdraw">
        {t("cta")}
      </Button>
      <LazyAlertDialog
        open={confirm}
        onOpenChange={(open) => (open ? null : setConfirm(false))}
        title={t("title")}
        description={t("body")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        loading={busy}
        onConfirm={() => void withdraw()}
      />
    </div>
  );
}
