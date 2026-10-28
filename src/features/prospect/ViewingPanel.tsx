"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";

import { VIEWING_STATUS } from "@/domain/status/viewing";
import { VIEWING_ACCESS_STATUS } from "@/domain/status/viewingAccess";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatDateTime, formatTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { openExternal } from "@/lib/liff/client";
import { Badge, StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { LazyAlertDialog, LazySheet } from "@/ui/components/overlays";
import { Spinner } from "@/ui/components/Spinner";
import { IconCalendar } from "@/ui/icons/glyphs/calendar";
import { IconChat } from "@/ui/icons/glyphs/chat";
import { IconExternal } from "@/ui/icons/glyphs/external";
import { IconKey } from "@/ui/icons/glyphs/key";
import { IconResident } from "@/ui/icons/glyphs/resident";

import { liveViewing, type Enquiry, type Slot } from "./model";
import { LazySelfViewingAccess } from "./selfViewing/LazySelfViewingAccess";
import { slotsOfMode } from "./selfViewing/model";
import { lazyWarm } from "@/ui/lib/lazy";

/** The picker is only needed in the change-time sheet: loaded with it (D-179, GL2). */
const SlotPicker = lazyWarm(() => import("./SlotPicker").then((m) => m.SlotPicker));

/**
 * The viewing of an enquiry (L5 5.1 §2): when, whether the owner confirmed, and what I can do before it — change the
 * time (a sheet with the free times, one tap to move), cancel, or open the way there in the maps app. Earlier
 * viewings (declined, moved, done) stay listed below, quietly.
 *
 * GL2 (D-295): a self viewing shows its door-code window and, once the owner confirmed, the door-code panel (loaded
 * lazily); an accompanied one shows who shows the room and how to reach them (the conversation below — the API gives
 * prospects no phone or LINE id of the owner, contract request #35). Moving a viewing keeps its mode.
 */
export function ViewingPanel({
  enquiry,
  directions,
}: {
  enquiry: Enquiry;
  /** A maps link for the listing's public address, when it has one. */
  directions: string | null;
}) {
  const t = useTranslations("prospect.rent.viewing");
  const sv = useTranslations("prospect.selfViewing.panel");
  const root = useTranslations();
  const locale = useLocale() as Locale;
  const router = useRouter();
  const live = liveViewing(enquiry);
  const past = enquiry.viewings.filter((v) => v.id !== live?.id);
  const [moving, setMoving] = useState(false);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function openMove() {
    setMoving(true);
    setPicked(null);
    setError(null);
    try {
      const body = unwrap(
        await browserApi.GET("/v1/public/listings/{slug}/viewing-slots", {
          params: { path: { slug: enquiry.listing.slug }, query: { days: 14 } },
        }),
      );
      setSlots(live ? slotsOfMode(body.slots, live.mode) : body.slots);
    } catch (caught) {
      setSlots([]);
      setError(toApiError(caught));
    }
  }

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
    <section aria-labelledby="enquiry-viewing" className="flex flex-col gap-3" data-testid="enquiry-viewing">
      <h2 id="enquiry-viewing" className="font-semibold">
        {t("title")}
      </h2>
      {live ? (
        <div
          className="border-border bg-surface rounded-card flex flex-col gap-3 border p-4"
          data-testid="live-viewing"
          data-state={live.state}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-lg font-semibold">{formatDateTime(live.startsAt, locale)}</span>
            <StatusBadge status={VIEWING_STATUS[live.state]} label={root(VIEWING_STATUS[live.state].labelKey)} />
          </div>
          <div className="flex flex-wrap items-center gap-2" data-testid="viewing-mode" data-mode={live.mode}>
            <Badge tone="neutral" icon={live.mode === "self" ? IconKey : IconResident}>
              {sv(`mode.${live.mode}`)}
            </Badge>
          </div>
          {live.mode === "self" ? (
            live.state === "confirmed" && live.access ? (
              <LazySelfViewingAccess viewing={{ ...live, access: live.access }} />
            ) : (
              <p className="text-muted text-sm" data-testid="self-waiting">
                {sv("waiting")}
              </p>
            )
          ) : (
            <div className="border-border flex flex-col gap-2 border-t pt-3" data-testid="viewing-host">
              <p className="text-sm">
                <span className="text-muted">{sv("host.label")} </span>
                <span className="font-medium">{enquiry.listing.ownerName}</span>
              </p>
              <p className="text-muted text-sm">{sv("host.body")}</p>
              <Button asChild variant="secondary" size="lg" block iconStart={IconChat}>
                <a href="#enquiry-thread" data-testid="viewing-host-message">
                  {sv("host.message", { name: enquiry.listing.ownerName })}
                </a>
              </Button>
            </div>
          )}
          {live.access?.state === "entered" ? null : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                size="lg"
                iconStart={IconCalendar}
                onClick={() => void openMove()}
                data-testid="viewing-reschedule"
              >
                {t("reschedule")}
              </Button>
              <Button variant="secondary" size="lg" onClick={() => setCancelling(true)} data-testid="viewing-cancel">
                {t("cancel")}
              </Button>
            </div>
          )}
          {directions ? (
            <Button
              variant="ghost"
              size="lg"
              block
              iconStart={IconExternal}
              onClick={() => void openExternal(directions)}
            >
              {t("directions")}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-muted text-sm">{t("none")}</p>
      )}
      {error && !moving && !cancelling ? <ProblemCallout error={error} /> : null}

      {past.length ? (
        <details className="text-sm">
          <summary className="text-muted min-h-12 cursor-pointer py-3">{t("history")}</summary>
          <ul className="flex flex-col gap-2" role="list">
            {past.map((v) => (
              <li key={v.id} className="flex flex-col gap-1" data-testid="past-viewing" data-state={v.state}>
                <span className="flex flex-wrap items-center gap-2">
                  <span>{formatDateTime(v.startsAt, locale)}</span>
                  <StatusBadge
                    status={VIEWING_STATUS[v.state]}
                    label={root(VIEWING_STATUS[v.state].labelKey)}
                    size="sm"
                  />
                </span>
                {v.access ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-muted">{sv(`mode.${v.mode}`)}</span>
                    <StatusBadge
                      status={VIEWING_ACCESS_STATUS[v.access.state]}
                      label={root(VIEWING_ACCESS_STATUS[v.access.state].labelKey)}
                      size="sm"
                    />
                  </span>
                ) : null}
                {v.state === "declined" && v.reason ? (
                  <span className="text-muted">{t("reason", { reason: v.reason })}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

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
    </section>
  );
}
