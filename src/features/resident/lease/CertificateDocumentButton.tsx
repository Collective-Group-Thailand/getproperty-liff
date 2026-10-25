"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { openExternal } from "@/lib/liff/client";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { IconExternal } from "@/ui/icons/glyphs/external";

/** Opens an issued rent certificate (B7.5): a 5-minute signed URL fetched on tap, opened the LIFF way. */
export function CertificateDocumentButton({ leaseId, certificateId }: { leaseId: string; certificateId: string }) {
  const t = useTranslations("resident.lease.certificates");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        block
        loading={busy}
        iconStart={IconExternal}
        data-testid="certificate-document"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const link = unwrap(
              await browserApi.GET("/v1/resident/leases/{leaseId}/rent-certificates/{certificateId}/document", {
                params: { path: { leaseId, certificateId } },
              }),
            );
            await openExternal(link.url);
          } catch (caught) {
            setError(toApiError(caught));
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("open")}
      </Button>
      {error ? <ProblemCallout error={error} /> : null}
    </div>
  );
}
