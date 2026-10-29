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
 * *No more suggestions for this move* — closes the offer and erases its destination after a confirmation; the consent
 * stays as it is (D-299). The page reloads from the API.
 */
export function DismissOffer({ offerId }: { offerId: string }) {
  const t = useTranslations("resident.relocation.dismiss");
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function dismiss() {
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await browserApi.POST("/v1/resident/relocation-offers/{offerId}/actions/dismiss", {
          params: { path: { offerId } },
        }),
      );
      setConfirm(false);
      router.refresh();
    } catch (caught) {
      setConfirm(false);
      setError(toApiError(caught));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? <ProblemCallout error={error} /> : null}
      <Button variant="ghost" size="lg" block onClick={() => setConfirm(true)} data-testid="relocation-dismiss">
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
        onConfirm={() => void dismiss()}
      />
    </div>
  );
}
