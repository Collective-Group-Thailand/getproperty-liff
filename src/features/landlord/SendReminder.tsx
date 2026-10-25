"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { toast } from "@/ui/components/Toast";
import { IconBell } from "@/ui/icons/glyphs/bell";

/**
 * `POST /v1/owner/invoices/{id}/actions/send-reminder` (Idempotency-Key, one per invoice for this screen): the lessee
 * gets the reminder in LINE; nothing else changes (D-024: a reminder never cuts a service).
 */
export function SendReminder({ invoiceId }: { invoiceId: string }) {
  const t = useTranslations("landlord.home.overdue");
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await browserApi.POST("/v1/owner/invoices/{invoiceId}/actions/send-reminder", {
          params: { path: { invoiceId }, header: { "Idempotency-Key": key } },
        }),
      );
      setSent(true);
      toast.success(t("reminded"));
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        iconStart={IconBell}
        loading={busy}
        disabled={sent}
        onClick={() => void send()}
        data-testid={`remind-${invoiceId}`}
      >
        {sent ? t("reminded") : t("remind")}
      </Button>
      {error ? <ProblemCallout error={error} /> : null}
    </div>
  );
}
