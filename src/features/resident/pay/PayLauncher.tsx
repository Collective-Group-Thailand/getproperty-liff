"use client";

import { useState } from "react";

import type { InvoiceView } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { IconQr } from "@/ui/icons/glyphs/qr";
import { lazyOverlay } from "@/ui/lib/lazy";

import type { PaySheetProps } from "./PaySheet";

/** The sheet, TanStack Query and the QR encoder load the first time it opens (D-179). */
const PaySheet = lazyOverlay<PaySheetProps>(() => import("./PaySheet").then((module) => module.default));

/**
 * "Scan to pay": opens the pay sheet in place — from the home hero, an invoice card or the invoice page — so the
 * QR is one tap away (L2: "สแกนจ่ายได้ใน 2 แตะ": this tap, then the banking app). `autoOpen` for a link that asks
 * for the sheet (`/invoices/{id}?pay=1`). Without `payable` only the sheet stays mounted (its paid state survives a
 * re-render of the page behind it).
 */
export function PayLauncher({
  invoice,
  label,
  autoOpen = false,
  payable = true,
  size = "xl",
  testId = "invoice-pay",
  className,
  vapidKey,
}: {
  invoice: InvoiceView;
  label: string;
  autoOpen?: boolean;
  payable?: boolean;
  size?: "lg" | "xl";
  testId?: string;
  className?: string;
  vapidKey?: string;
}) {
  const [open, setOpen] = useState(autoOpen);
  return (
    <>
      {payable ? (
        <Button
          size={size}
          block
          iconStart={IconQr}
          className={className}
          onClick={() => setOpen(true)}
          data-testid={testId}
        >
          {label}
        </Button>
      ) : null}
      <PaySheet
        open={open}
        onOpenChange={setOpen}
        invoiceId={invoice.id}
        invoiceNumber={invoice.number}
        initial={invoice}
        vapidKey={vapidKey}
      />
    </>
  );
}
