"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { openExternal } from "@/lib/liff/client";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { IconExternal } from "@/ui/icons/glyphs/external";

/**
 * Opens the lease document: `GET …/contract` gives a 5-minute signed URL (the countersigned copy once signed,
 * D-062), opened the LIFF way (`openExternal`: LINE's viewer cannot always show a PDF). Fetched on tap, never
 * on render, so the link is fresh and each opening is audited by the API.
 */
export function ContractButton({ leaseId, signed }: { leaseId: string; signed: boolean }) {
  const t = useTranslations("resident.lease.document");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="lg"
        block
        loading={busy}
        iconStart={IconExternal}
        data-testid="lease-document"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const contract = unwrap(
              await browserApi.GET("/v1/resident/leases/{leaseId}/contract", { params: { path: { leaseId } } }),
            );
            await openExternal(contract.url);
          } catch (caught) {
            setError(toApiError(caught));
          } finally {
            setBusy(false);
          }
        }}
      >
        {signed ? t("openSigned") : t("open")}
      </Button>
      {error ? <ProblemCallout error={error} /> : null}
    </div>
  );
}
