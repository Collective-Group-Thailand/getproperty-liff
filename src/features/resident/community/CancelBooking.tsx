"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { LazyAlertDialog } from "@/ui/components/overlays";
import { toast } from "@/ui/components/Toast";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

/** Cancels a requested or confirmed booking of my unit after a confirmation that restates it. */
export function CancelBooking({
  bookingId,
  summary,
}: {
  bookingId: string;
  summary: { facility: string; date: string; from: string; to: string };
}) {
  const t = useTranslations("resident.community.facilities");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  return (
    <>
      <Button
        variant="ghost"
        size="lg"
        iconStart={IconXCircle}
        className="self-start"
        onClick={() => setOpen(true)}
        data-testid="booking-cancel"
      >
        {t("cancel")}
      </Button>
      {error ? <ProblemCallout error={error} /> : null}
      <LazyAlertDialog
        open={open}
        onOpenChange={setOpen}
        title={t("cancelTitle")}
        description={t("cancelBody", summary)}
        confirmLabel={t("cancel")}
        cancelLabel={t("cancelKeep")}
        tone="destructive"
        loading={busy}
        onConfirm={async () => {
          setBusy(true);
          setError(null);
          try {
            unwrap(
              await browserApi.POST("/v1/resident/facility-bookings/{bookingId}/actions/cancel", {
                params: { path: { bookingId } },
                body: {},
              }),
            );
            setOpen(false);
            void toast.success(t("cancelled"));
            router.refresh();
          } catch (caught) {
            setError(toApiError(caught));
            setOpen(false);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
