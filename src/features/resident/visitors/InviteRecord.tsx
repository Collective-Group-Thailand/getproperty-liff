"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { LazyAlertDialog } from "@/ui/components/overlays";

/** Ending a pass early (D-327): the guard's next scan refuses it. Behind a confirmation; the household only. */
export function RevokeInvite({ unitId, inviteId, name }: { unitId: string; inviteId: string; name: string }) {
  const t = useTranslations("resident.visitors.invite.revoke");
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await browserApi.POST("/v1/resident/units/{unitId}/visit-invites/{inviteId}/actions/revoke", {
          params: { path: { unitId, inviteId } },
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
      <Button variant="destructive" size="lg" block onClick={() => setConfirm(true)} data-testid="invite-revoke">
        {t("button")}
      </Button>
      <LazyAlertDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("title", { name })}
        description={t("body")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        tone="destructive"
        loading={busy}
        onConfirm={() => void revoke()}
      />
    </div>
  );
}
