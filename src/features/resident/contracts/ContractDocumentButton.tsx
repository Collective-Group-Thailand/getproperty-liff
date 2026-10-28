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
 * Opens the document's PDF: `GET …/document` gives a 5-minute signed URL (the signed copy once everyone signed,
 * D-062), fetched on tap — never on render — and opened the LIFF way (`openExternal`).
 */
export function ContractDocumentButton({ contractId, signed }: { contractId: string; signed: boolean }) {
  const t = useTranslations("resident.contracts.detail");
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
        data-testid="contract-document"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const document = unwrap(
              await browserApi.GET("/v1/resident/contracts/{contractId}/document", {
                params: { path: { contractId } },
              }),
            );
            await openExternal(document.url);
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
