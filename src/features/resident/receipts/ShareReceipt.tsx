"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { shareToLine } from "@/lib/liff/client";
import { liffUrl } from "@/lib/liff/links";
import { Button } from "@/ui/components/Button";
import { IconChat } from "@/ui/icons/glyphs/chat";

type Outcome = "idle" | "sent" | "shared" | "copied" | "cancelled" | "failed";

/**
 * Shares a receipt to a LINE chat (L2 2.2 §3): `liff.shareTargetPicker` through the wrapper where LINE offers it
 * (a short text with the number, amount and issuer, and a link that opens the receipt in this app — never the
 * PDF's signed URL, which expires in 5 minutes and is personal). Outside LINE, or where the picker is off, the
 * system share sheet; failing that, the text is copied.
 */
export function ShareReceipt({
  receiptId,
  number,
  amount,
  issuer,
}: {
  receiptId: string;
  number: string;
  amount: string;
  issuer: string;
}) {
  const t = useTranslations("resident.receipts.share");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("idle");

  async function share() {
    const link = new URL(liffUrl(`/receipts/${receiptId}`), window.location.href).toString();
    const text = t("text", { number, amount, issuer, link });
    const viaLine = await shareToLine([{ type: "text", text }]);
    if (viaLine === "sent") return setOutcome("sent");
    if (viaLine === "cancelled") return setOutcome("cancelled");
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: t("title", { number }), text, url: link });
        return setOutcome("shared");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return setOutcome("cancelled");
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setOutcome("copied");
    } catch {
      setOutcome("failed");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="lg"
        block
        loading={busy}
        iconStart={IconChat}
        data-testid="receipt-share"
        onClick={async () => {
          setBusy(true);
          try {
            await share();
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("button")}
      </Button>
      <p className="text-muted text-sm" aria-live="polite" data-testid="receipt-share-outcome">
        {outcome === "idle" || outcome === "cancelled" ? "" : t(`outcome.${outcome}`)}
      </p>
    </div>
  );
}
