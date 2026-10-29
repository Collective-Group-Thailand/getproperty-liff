"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatDateTime, formatTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { LazyAlertDialog, LazySheet } from "@/ui/components/overlays";
import { Spinner } from "@/ui/components/Spinner";
import { lazyWarm } from "@/ui/lib/lazy";

import type { Enquiry, Slot } from "./model";
import { slotsOfMode } from "./selfViewing/model";

/** The picker is only needed in the change-time sheet: loaded with it (D-179, GL2). */
const SlotPicker = lazyWarm(() => import("./SlotPicker").then((m) => m.SlotPicker));

type Live = Enquiry["viewings"][number];

/**
 * Changing the time of a viewing (a sheet with the free times, one tap to move) or cancelling it — code only needed
 * after a tap, so it is loaded then (D-179; split out of `ViewingPanel` in GL4 when a chunk regrouping pushed the
 * enquiry page 0.5 KB over 180 KB). `moving` / `cancelling` are the panel's; `onClose` gives them back.
 */
export function ViewingChanges({
  enquiry,
  live,
  moving,
  cancelling,
  onCloseMove,
  onCloseCancel,
}: {
  enquiry: Enquiry;
  live: Live | null;
  moving: boolean;
  cancelling: boolean;
  onCloseMove: () => void;
  onCloseCancel: () => void;
}) {
  const t = useTranslations("prospect.rent.viewing");
  const root = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const setMoving = (open: boolean) => (open ? undefined : onCloseMove());
  const setCancelling = (open: boolean) => (open ? undefined : onCloseCancel());

  // Each opening of the sheet starts from nothing picked and asks for the free times again (others book meanwhile).
  const [openedFor, setOpenedFor] = useState(false);
  if (moving !== openedFor) {
    setOpenedFor(moving);
    if (moving) {
      setSlots(null);
      setPicked(null);
      setError(null);
    }
  }

  useEffect(() => {
    if (!moving) return;
    let current = true;
    browserApi
      .GET("/v1/public/listings/{slug}/viewing-slots", {
        params: { path: { slug: enquiry.listing.slug }, query: { days: 14 } },
      })
      .then((result) => {
        const body = unwrap(result);
        if (current) setSlots(live ? slotsOfMode(body.slots, live.mode) : body.slots);
      })
      .catch((caught: unknown) => {
        if (!current) return;
        setSlots([]);
        setError(toApiError(caught));
      });
    return () => {
      current = false;
    };
  }, [moving, enquiry.listing.slug, live]);

  async function act(run: () => Promise<unknown>, done: () => void) {
    setBusy(true);
    setError(null);
    try {
      await run();
      done();
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  const path = live ? { params: { path: { viewingId: live.id } } } : null;

  return (
    <>
      <LazySheet
        open={moving}
        onOpenChange={(open) => {
          if (!busy) setMoving(open);
        }}
        title={t("rescheduleTitle")}
        closeLabel={t("close")}
        side="bottom"
        footer={
          <Button
            size="lg"
            block
            loading={busy}
            disabled={!picked}
            data-testid="reschedule-confirm"
            onClick={() =>
              path &&
              picked &&
              void act(
                async () =>
                  unwrap(
                    await browserApi.POST("/v1/prospect/viewings/{viewingId}/actions/reschedule", {
                      ...path,
                      body: { startsAt: picked },
                    }),
                  ),
                () => setMoving(false),
              )
            }
          >
            {picked ? t("rescheduleConfirm", { time: formatTime(picked, locale) }) : root("prospect.rent.book.pick")}
          </Button>
        }
      >
        <div className="flex flex-col gap-3 px-5 pb-4">
          {slots === null ? <Spinner label={t("rescheduleTitle")} /> : null}
          {slots && slots.length === 0 ? (
            <p className="text-muted text-sm">{root("prospect.rent.book.noSlots")}</p>
          ) : null}
          {slots && slots.length ? (
            <Suspense fallback={<Spinner label={t("rescheduleTitle")} />}>
              <SlotPicker slots={slots} value={picked} onChange={setPicked} testId="reschedule-slots" />
            </Suspense>
          ) : null}
          {error ? <ProblemCallout error={error} /> : null}
        </div>
      </LazySheet>

      <LazyAlertDialog
        open={cancelling}
        onOpenChange={(open) => {
          if (!busy) setCancelling(open);
        }}
        title={live ? t("cancelTitle", { date: formatDateTime(live.startsAt, locale) }) : t("cancel")}
        description={t("cancelBody")}
        confirmLabel={t("cancel")}
        cancelLabel={t("keep")}
        tone="destructive"
        loading={busy}
        onConfirm={() =>
          path &&
          void act(
            async () =>
              unwrap(await browserApi.POST("/v1/prospect/viewings/{viewingId}/actions/cancel", { ...path, body: {} })),
            () => setCancelling(false),
          )
        }
      >
        {error ? <ProblemCallout error={error} /> : null}
      </LazyAlertDialog>
    </>
  );
}
