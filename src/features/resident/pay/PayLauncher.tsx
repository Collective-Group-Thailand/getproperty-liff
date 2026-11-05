"use client";

import { useState } from "react";

import type { InvoiceView } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { IconQr } from "@/ui/icons/glyphs/qr";
import { IconUpload } from "@/ui/icons/glyphs/upload";
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
  variant = "primary",
  testId = "invoice-pay",
  className,
  vapidKey,
  slipLabel,
  slipTestId = "invoice-slip",
}: {
  invoice: InvoiceView;
  label: string;
  autoOpen?: boolean;
  payable?: boolean;
  size?: "lg" | "xl";
  /** `secondary` for every pay button after the first on a screen (one filled action per screen). */
  variant?: "primary" | "secondary";
  testId?: string;
  className?: string;
  vapidKey?: string;
  /**
   * JL1: an outlined "attach the transfer slip" under the pay button that opens the same sheet on the slip step (the
   * existing slip flow, D-043). Omitted: the slip stays reachable from inside the QR sheet only.
   */
  slipLabel?: string;
  slipTestId?: string;
}) {
  const [open, setOpen] = useState(autoOpen);
  const [mode, setMode] = useState<"qr" | "slip">("qr");
  return (
    <>
      {payable ? (
        <Button
          size={size}
          variant={variant}
          block
          iconStart={IconQr}
          className={className}
          onClick={() => {
            setMode("qr");
            setOpen(true);
          }}
          data-testid={testId}
        >
          {label}
        </Button>
      ) : null}
      {payable && slipLabel ? (
        <Button
          size="lg"
          variant="secondary"
          block
          iconStart={IconUpload}
          onClick={() => {
            setMode("slip");
            setOpen(true);
          }}
          data-testid={slipTestId}
        >
          {slipLabel}
        </Button>
      ) : null}
      <PaySheet
        key={mode}
        initialMode={mode}
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
