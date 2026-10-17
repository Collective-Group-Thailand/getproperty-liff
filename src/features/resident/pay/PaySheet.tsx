"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import type { InvoiceView } from "@/lib/api/contract-requests";
import { QueryProvider } from "@/lib/api/QueryProvider";
import { qk } from "@/lib/api/query-keys";
import { isApiError } from "@/lib/api/problem";
import { Skeleton } from "@/ui/components/Skeleton";
// eslint-disable-next-line no-restricted-imports -- this module is itself loaded on first open (PayLauncher, D-179)
import { Sheet } from "@/ui/components/Sheet";
import { lazyWarm } from "@/ui/lib/lazy";

import { QrPanel } from "./QrPanel";

/**
 * The sheet opens with the QR only (D-179). The paid state (push offer) is its own chunk, warmed as soon as the
 * sheet is open so the confirmation never waits; the slip flow (camera, image compression, stepper) — the fallback
 * most residents never open — loads when "send the slip" is tapped.
 */
const PaidPanel = lazyWarm(() => import("./PaidPanel").then((module) => module.PaidPanel));
const SlipPanel = lazy(() => import("./SlipPanel").then((module) => ({ default: module.SlipPanel })));

export interface PaySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: string;
  invoiceNumber: string;
  /** The invoice as the page rendered it — the starting point until the first refetch. */
  initial: InvoiceView;
  /** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, for the push offer after the first payment. */
  vapidKey?: string;
}

/**
 * While the sheet is open and the invoice is unpaid, it is re-read this often. Realtime events
 * (`payment.confirmed`, `invoice.paid` — `RealtimeBridge`) refresh it at once where the resident's stream carries
 * them (CONTRACT-REQUEST #16); this is the fallback.
 */
export const STATUS_POLL_MS = 10_000;

type Mode = "qr" | "slip";

function Loading({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-4" aria-busy="true" data-testid="pay-loading">
      <Skeleton className="size-60 rounded-lg" />
      <Skeleton className="h-6 w-40" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

function PayFlow({
  invoiceId,
  initial,
  vapidKey,
  onClose,
  onPaid,
}: Omit<PaySheetProps, "open" | "onOpenChange" | "invoiceNumber"> & { onClose: () => void; onPaid: () => void }) {
  const t = useTranslations("resident.pay");
  const [mode, setMode] = useState<Mode>("qr");

  const invoice = useQuery({
    queryKey: qk.resident.invoice(invoiceId),
    queryFn: async () =>
      unwrap(
        await browserApi.GET("/v1/resident/invoices/{invoiceId}", { params: { path: { invoiceId } } }),
      ) as InvoiceView,
    initialData: initial,
    initialDataUpdatedAt: 0,
    refetchInterval: (query) => (query.state.data?.status === "paid" ? false : STATUS_POLL_MS),
    refetchIntervalInBackground: false,
  });
  const paid = invoice.data.status === "paid";

  const payment = useQuery({
    queryKey: qk.resident.payment(invoiceId),
    queryFn: async () =>
      unwrap(await browserApi.GET("/v1/resident/invoices/{invoiceId}/payment", { params: { path: { invoiceId } } })),
    enabled: !paid,
    staleTime: 0,
  });

  // Paid while the sheet was open: the paid state is final here; the page behind is refreshed when it closes.
  const wasOpen = useRef(initial.status !== "paid");
  const [justPaid, setJustPaid] = useState(false);
  useEffect(() => {
    if (paid && wasOpen.current) {
      wasOpen.current = false;
      setJustPaid(true);
      onPaid();
    }
  }, [paid, onPaid]);

  // A partial payment changes what is due: the QR is re-created for the new amount (D-197).
  const balance = invoice.data.balance;
  const lastBalance = useRef(balance);
  const { refetch } = payment;
  useEffect(() => {
    if (lastBalance.current !== balance) {
      lastBalance.current = balance;
      void refetch();
    }
  }, [balance, refetch]);

  if (paid) {
    return (
      <Suspense fallback={<Loading label={t("loading")} />}>
        <PaidPanel invoice={invoice.data} justPaid={justPaid} vapidKey={vapidKey} onClose={onClose} />
      </Suspense>
    );
  }
  if (payment.isPending) return <Loading label={t("loading")} />;
  if (payment.isError) {
    const error = isApiError(payment.error) ? payment.error : null;
    return error ? <ProblemCallout error={error} /> : <p>{t("loadFailed")}</p>;
  }
  const data = payment.data;
  if (mode === "slip" && data.allowSlip) {
    return (
      <Suspense fallback={<Loading label={t("loading")} />}>
        <SlipPanel invoiceId={invoiceId} payment={data} onBack={() => setMode("qr")} />
      </Suspense>
    );
  }
  return (
    <QrPanel
      invoice={invoice.data}
      payment={data}
      refreshing={payment.isFetching}
      onRefresh={() => void refetch()}
      onSlip={() => setMode("slip")}
    />
  );
}

/**
 * The pay sheet (L2 2.2 §1, design-system.md §5 "QR pay sheet"): the invoice's Thai QR from the API with the
 * amount and reference, helpers to save it and open a banking app, the QR's validity, and the live status — the
 * moment the payment is confirmed the sheet turns into a paid state that feels final, with the receipt. A transfer
 * with a slip is the fallback (D-043). Loaded on first open, with TanStack Query and the QR encoder (D-179); the
 * page behind it is rendered again when the sheet closes after a payment.
 */
export default function PaySheet({ open, onOpenChange, invoiceId, invoiceNumber, initial, vapidKey }: PaySheetProps) {
  const t = useTranslations("resident.pay");
  const common = useTranslations("common");
  const router = useRouter();
  const paidHere = useRef(false);
  const change = (next: boolean) => {
    onOpenChange(next);
    if (!next && paidHere.current) {
      paidHere.current = false;
      router.refresh();
    }
  };
  return (
    <Sheet
      open={open}
      onOpenChange={change}
      title={t("title")}
      description={t("subtitle", { number: invoiceNumber })}
      closeLabel={common("close")}
    >
      <div data-testid="pay-sheet">
        <QueryProvider>
          <PayFlow
            invoiceId={invoiceId}
            initial={initial}
            vapidKey={vapidKey}
            onClose={() => change(false)}
            onPaid={() => {
              paidHere.current = true;
            }}
          />
        </QueryProvider>
      </div>
    </Sheet>
  );
}
