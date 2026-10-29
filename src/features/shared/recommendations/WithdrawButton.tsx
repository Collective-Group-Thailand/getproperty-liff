"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";

import { basePath, type RecommendationsAudience } from "./model";

/**
 * Withdrawal in one tap (D-300, D-025 — as easy as giving consent): no dialog, no questions. The API records it,
 * cancels pending messages and stops using the preferences at once; the page then says so (`?stopped=1`). Offered
 * also while the agreement on file is for an earlier version of the text (`outdated`): withdrawing never requires
 * agreeing to the new text first.
 */
export function WithdrawButton({
  audience,
  outdated = false,
}: {
  audience: RecommendationsAudience;
  outdated?: boolean;
}) {
  const t = useTranslations("recommendations.status");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function withdraw() {
    setError(null);
    setBusy(true);
    try {
      unwrap(
        audience === "resident"
          ? await browserApi.POST("/v1/resident/me/recommendations/actions/withdraw")
          : await browserApi.POST("/v1/prospect/me/recommendations/actions/withdraw"),
      );
      router.replace(`${basePath(audience)}?stopped=1`, { scroll: true });
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="lg"
        block
        loading={busy}
        onClick={withdraw}
        data-testid="recommendations-withdraw"
      >
        {t("stop")}
      </Button>
      <p className="text-muted text-center text-sm">{outdated ? t("outdated.stopHint") : t("stopHint")}</p>
      {error ? <ProblemCallout error={error} /> : null}
    </div>
  );
}
