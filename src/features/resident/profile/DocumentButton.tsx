"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { bffJson } from "@/lib/api/browser";
import type { DocumentDownload } from "@/lib/api/contract-requests";
import { isApiError, type ApiError } from "@/lib/api/problem";
import { openExternal } from "@/lib/liff/client";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { IconExternal } from "@/ui/icons/glyphs/external";

/** Opens one document on file (view only). CONTRACT-REQUEST #11: `GET /v1/resident/documents/{id}/download`. */
export function DocumentButton({ documentId, title }: { documentId: string; title: string }) {
  const t = useTranslations("resident.profile.documents");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        size="lg"
        loading={busy}
        iconStart={IconExternal}
        aria-label={t("open", { title })}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            // CONTRACT-REQUEST #11 (docs/contract-requests.md).
            const download = await bffJson<DocumentDownload>(
              `/v1/resident/documents/${encodeURIComponent(documentId)}/download`,
            );
            await openExternal(download.url);
          } catch (caught) {
            if (!isApiError(caught)) throw caught;
            setError(caught);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("view")}
      </Button>
      {error ? <ProblemCallout error={error} /> : null}
    </div>
  );
}
