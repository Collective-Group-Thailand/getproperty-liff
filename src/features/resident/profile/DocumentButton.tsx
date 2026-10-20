"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { browserApi, unwrap } from "@/lib/api/browser";
import { isApiError, type ApiError } from "@/lib/api/problem";
import { openExternal } from "@/lib/liff/client";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { IconExternal } from "@/ui/icons/glyphs/external";

/** Opens one document on file (view only): `GET /v1/resident/documents/{id}/download` → a 5-minute link. */
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
            const download = unwrap(
              await browserApi.GET("/v1/resident/documents/{documentId}/download", {
                params: { path: { documentId } },
              }),
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
