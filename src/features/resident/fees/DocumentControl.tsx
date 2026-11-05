"use client";

import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { openExternal } from "@/lib/liff/client";
import { Button } from "@/ui/components/Button";
import { IconDownload } from "@/ui/icons/glyphs/download";

export type DocumentTarget =
  | { kind: "receipt"; id: string }
  | { kind: "statement"; id: string }
  | { kind: "clearance"; unitId: string; id: string };

/** A 5-minute signed link from the API, fetched on tap — never on render (D-063). */
export async function documentUrl(target: DocumentTarget): Promise<string> {
  switch (target.kind) {
    case "receipt":
      return unwrap(
        await browserApi.GET("/v1/resident/receipts/{receiptId}/document", {
          params: { path: { receiptId: target.id } },
        }),
      ).url;
    case "statement":
      return unwrap(
        await browserApi.GET("/v1/resident/statements/{statementId}/document", {
          params: { path: { statementId: target.id } },
        }),
      ).url;
    case "clearance":
      return unwrap(
        await browserApi.GET("/v1/resident/units/{unitId}/debt-clearances/{debtClearanceId}/document", {
          params: { path: { unitId: target.unitId, debtClearanceId: target.id } },
        }),
      ).url;
  }
}

/**
 * Opens a document PDF the LIFF way (`openExternal`, the system viewer). `compact`: the outlined 36-px control at the
 * end of a document row (J-DESIGN §3: outlined, 10-px radius — never a tinted pill); otherwise a full-width outlined
 * button. A statement whose PDF is still being made answers `statement.document_pending`, shown in the API's words.
 */
export function DocumentControl({
  target,
  label,
  compact = false,
  testId,
}: {
  target: DocumentTarget;
  label: string;
  compact?: boolean;
  testId?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  return (
    <div className={compact ? "flex shrink-0 flex-col items-end gap-2" : "flex flex-col gap-2"}>
      <Button
        variant="secondary"
        size={compact ? "sm" : "lg"}
        block={!compact}
        loading={busy}
        iconStart={IconDownload}
        data-testid={testId}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await openExternal(new URL(await documentUrl(target), window.location.href).toString());
          } catch (caught) {
            setError(toApiError(caught));
          } finally {
            setBusy(false);
          }
        }}
      >
        {label}
      </Button>
      {error ? (
        <div className={compact ? "w-full" : undefined}>
          <ProblemCallout error={error} />
        </div>
      ) : null}
    </div>
  );
}
