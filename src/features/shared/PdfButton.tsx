"use client";

import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import { isApiError, type ApiError } from "@/lib/api/problem";
import { openExternal } from "@/lib/liff/client";
import { Button } from "@/ui/components/Button";
import { IconExternal } from "@/ui/icons/glyphs/external";

async function documentUrl(kind: "invoice" | "receipt", id: string): Promise<string> {
  if (kind === "invoice") {
    return unwrap(
      await browserApi.GET("/v1/resident/invoices/{invoiceId}/document", { params: { path: { invoiceId: id } } }),
    ).url;
  }
  return unwrap(
    await browserApi.GET("/v1/resident/receipts/{receiptId}/document", { params: { path: { receiptId: id } } }),
  ).url;
}

/**
 * Opens an invoice or receipt PDF: the API gives a 5-minute signed link (D-063), fetched on tap — never on render —
 * and opened the LIFF way in the system viewer (`openExternal`: LINE's in-app browser cannot always show a PDF).
 * A receipt whose PDF is still being made answers `export.not_ready`, shown with the API's own words.
 */
export function PdfButton({
  kind,
  id,
  children,
  testId,
}: {
  kind: "invoice" | "receipt";
  id: string;
  children: React.ReactNode;
  testId?: string;
}) {
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
        data-testid={testId}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await openExternal(new URL(await documentUrl(kind, id), window.location.href).toString());
          } catch (caught) {
            if (!isApiError(caught)) throw caught;
            setError(caught);
          } finally {
            setBusy(false);
          }
        }}
      >
        {children}
      </Button>
      {error ? <ProblemCallout error={error} /> : null}
    </div>
  );
}
