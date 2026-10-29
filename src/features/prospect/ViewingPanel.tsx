"use client";

import { useLocale, useTranslations } from "next-intl";
import { Suspense, useState, type ComponentProps } from "react";

import { VIEWING_STATUS } from "@/domain/status/viewing";
import { VIEWING_ACCESS_STATUS } from "@/domain/status/viewingAccess";
import { formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { openExternal } from "@/lib/liff/client";
import { Badge, StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { IconCalendar } from "@/ui/icons/glyphs/calendar";
import { IconChat } from "@/ui/icons/glyphs/chat";
import { IconExternal } from "@/ui/icons/glyphs/external";
import { IconKey } from "@/ui/icons/glyphs/key";
import { IconResident } from "@/ui/icons/glyphs/resident";

import { liveViewing, type Enquiry } from "./model";
import type { ViewingChanges as ChangesImpl } from "./ViewingChanges";
import { LazySelfViewingAccess } from "./selfViewing/LazySelfViewingAccess";
import { lazyWarm } from "@/ui/lib/lazy";

/** Changing the time and cancelling load on the first tap (D-179). */
const ViewingChanges = lazyWarm<ComponentProps<typeof ChangesImpl>>(() =>
  import("./ViewingChanges").then((m) => m.ViewingChanges),
);

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
  const live = liveViewing(enquiry);
  const past = enquiry.viewings.filter((v) => v.id !== live?.id);
  const [moving, setMoving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  /** Keeps the change / cancel module mounted after its first use (the overlays close with their animation). */
  const [changesWanted, setChangesWanted] = useState(false);

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
                onClick={() => {
                  setChangesWanted(true);
                  setMoving(true);
                }}
                data-testid="viewing-reschedule"
              >
                {t("reschedule")}
              </Button>
              <Button
                variant="secondary"
                size="lg"
                onClick={() => {
                  setChangesWanted(true);
                  setCancelling(true);
                }}
                data-testid="viewing-cancel"
              >
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

      {moving || cancelling || changesWanted ? (
        <Suspense fallback={null}>
          <ViewingChanges
            enquiry={enquiry}
            live={live}
            moving={moving}
            cancelling={cancelling}
            onCloseMove={() => setMoving(false)}
            onCloseCancel={() => setCancelling(false)}
          />
        </Suspense>
      ) : null}
    </section>
  );
}
