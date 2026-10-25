"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { openExternal } from "@/lib/liff/client";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { IconExternal } from "@/ui/icons/glyphs/external";

/** Opens a letter's PDF (B7.5): a 5-minute signed URL fetched on tap, opened the LIFF way like the lease document. */
export function NoticeDocumentButton({ leaseId, noticeId }: { leaseId: string; noticeId: string }) {
  const t = useTranslations("resident.lease.letters");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button
        size="lg"
        block
        loading={busy}
        iconStart={IconExternal}
        data-testid="letter-document"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const link = unwrap(
              await browserApi.GET("/v1/resident/leases/{leaseId}/notices/{noticeId}/document", {
                params: { path: { leaseId, noticeId } },
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
