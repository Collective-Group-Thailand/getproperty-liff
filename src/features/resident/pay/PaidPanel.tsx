"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { formatTHB } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import type { InvoiceView } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Icon } from "@/ui/icons";
import { IconBill } from "@/ui/icons/glyphs/bill";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";

import { PushOffer } from "./PushOffer";

/**
 * Paid (L2 2.2 §1: "a paid state that feels final"): one large tick, the words, the amount the invoice asked for,
 * and the receipt the API linked to this invoice (`receipts`; the receipt can lag the payment by a moment, then the
 * receipts list, where the new receipt is on top. Focus moves to the heading so a screen reader hears it. After the
 * first payment in this browser, the push offer (a meaningful moment, never on first open).
 */
export function PaidPanel({
  invoice,
  justPaid,
  vapidKey,
  onClose,
}: {
  invoice: InvoiceView;
  justPaid: boolean;
  vapidKey?: string;
  onClose: () => void;
}) {
  const t = useTranslations("resident.pay.paid");
  const current = useLocale();
  const locale = isLocale(current) ? current : "th";
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const receipt = invoice.receipts[0];

  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center" data-testid="pay-paid">
      <span className="bg-success-subtle text-success-subtle-fg flex size-20 items-center justify-center rounded-full">
        <Icon icon={IconCheckCircle} size={48} />
      </span>
      <h3 ref={heading} tabIndex={-1} className="font-display text-2xl font-semibold outline-none" aria-live="polite">
        {justPaid ? t("title") : t("alreadyTitle")}
      </h3>
      <p className="text-muted">
        {t("body", { amount: formatTHB(invoice.amountDue, locale), number: invoice.number })}
      </p>
      <div className="flex w-full flex-col gap-2">
        <Button asChild size="lg" block iconStart={IconBill} data-testid="pay-receipt">
          <Link href={receipt ? `/receipts/${receipt.id}` : "/receipts"} onClick={onClose}>
            {receipt ? t("receipt", { number: receipt.number }) : t("receipts")}
          </Link>
        </Button>
        <Button variant="ghost" size="lg" block onClick={onClose}>
          {t("done")}
        </Button>
      </div>
      {justPaid ? <PushOffer vapidKey={vapidKey} /> : null}
    </div>
  );
}
