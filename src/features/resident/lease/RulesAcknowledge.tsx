"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { bffJson } from "@/lib/api/browser";
import { isApiError, type ApiError } from "@/lib/api/problem";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Checkbox } from "@/ui/components/Checkbox";

/**
 * Building rules acknowledgement (L3 3.1 §3): the resident ticks that they read the rules above and confirms.
 * CONTRACT-REQUEST #8: `POST /v1/resident/leases/{leaseId}/rules/acknowledge` is not in the contract yet.
 */
export function RulesAcknowledge({ leaseId, acknowledgedOn }: { leaseId: string; acknowledgedOn: string | null }) {
  const t = useTranslations("resident.lease.rules");
  const router = useRouter();
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (acknowledgedOn) {
    return (
      <p className="text-success-subtle-fg mt-3 text-sm font-medium" data-testid="rules-acknowledged">
        {t("acknowledged", { date: acknowledgedOn })}
      </p>
    );
  }
  return (
    <form
      className="mt-4 flex flex-col gap-3"
      data-testid="rules-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!read) return;
        setBusy(true);
        setError(null);
        try {
          // CONTRACT-REQUEST #8 (docs/contract-requests.md).
          await bffJson(`/v1/resident/leases/${encodeURIComponent(leaseId)}/rules/acknowledge`, { method: "POST" });
          router.refresh();
        } catch (caught) {
          if (!isApiError(caught)) throw caught;
          setError(caught);
          setBusy(false);
        }
      }}
    >
      <Callout tone="neutral">{t("lead")}</Callout>
      <Checkbox label={t("checkbox")} checked={read} onCheckedChange={(checked) => setRead(checked === true)} />
      {error ? <ProblemCallout error={error} /> : null}
      <Button type="submit" size="lg" block disabled={!read} loading={busy} data-testid="rules-submit">
        {t("submit")}
      </Button>
    </form>
  );
}
