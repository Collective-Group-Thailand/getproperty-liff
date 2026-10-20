import { getTranslations } from "next-intl/server";

import { PARCEL_STATUS } from "@/domain/status/parcel";
import { qrSvg } from "@/features/shared/qrSvg";
import { formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconParcel } from "@/ui/icons/glyphs/parcel";

import type { Parcel } from "./data";

/** The pick-up PIN, big, with a QR of it the desk can scan from the phone (D-212). Server-rendered SVG. */
async function PickupCode({ parcel, locale }: { parcel: Parcel & { pin: string }; locale: Locale }) {
  const t = await getTranslations("resident.community.parcels");
  const qr = qrSvg(parcel.pin);
  const titleId = `pin-${parcel.id}`;
  return (
    <div className="flex flex-col items-center gap-3 pt-2" data-testid="parcel-pin">
      <h3 id={titleId} className="text-muted text-sm font-medium">
        {t("pinTitle")}
      </h3>
      <p className="font-mono text-5xl font-semibold tracking-[0.2em] tabular-nums" data-testid="parcel-pin-code">
        {parcel.pin}
      </p>
      <svg
        role="img"
        aria-label={t("pinQr", { pin: parcel.pin })}
        viewBox={`0 0 ${qr.size} ${qr.size}`}
        className="size-56 rounded-md bg-white p-1"
        shapeRendering="crispEdges"
        data-testid="parcel-pin-qr"
      >
        <rect width={qr.size} height={qr.size} fill="#fff" />
        <path d={qr.path} fill="#000" />
      </svg>
      <p className="text-muted text-center text-sm">{t("pinHelp")}</p>
      <p className="sr-only">{t("pinFor", { date: formatDateTime(parcel.receivedAt, locale) })}</p>
    </div>
  );
}

async function ParcelCard({ parcel, locale, showUnit }: { parcel: Parcel; locale: Locale; showUnit: boolean }) {
  const [t, root] = await Promise.all([getTranslations("resident.community.parcels"), getTranslations()]);
  const status = PARCEL_STATUS[parcel.status];
  return (
    <li>
      <Card padding="md" className="flex flex-col gap-2" data-testid="parcel" data-status={parcel.status}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">{parcel.carrier ? t("carrier", { carrier: parcel.carrier }) : t("title")}</p>
          <StatusBadge status={status} label={root(status.labelKey)} size="sm" />
        </div>
        {showUnit ? <p className="text-muted text-sm">{t("unit", { unit: parcel.unitNo })}</p> : null}
        {parcel.trackingNo ? (
          <p className="text-muted font-mono text-sm break-all">{t("tracking", { number: parcel.trackingNo })}</p>
        ) : null}
        <p className="text-muted text-sm">{t("received", { date: formatDateTime(parcel.receivedAt, locale) })}</p>
        {parcel.pickedUpAt ? (
          <p className="text-muted text-sm">{t("pickedUp", { date: formatDateTime(parcel.pickedUpAt, locale) })}</p>
        ) : null}
        {parcel.returnedAt ? (
          <p className="text-muted text-sm">
            {t("returned", { date: formatDateTime(parcel.returnedAt, locale) })}
            {parcel.returnReason ? ` · ${t("returnReason", { reason: parcel.returnReason })}` : ""}
          </p>
        ) : null}
        {parcel.notes ? <p className="text-sm">{parcel.notes}</p> : null}
        {parcel.pin ? <PickupCode parcel={{ ...parcel, pin: parcel.pin }} locale={locale} /> : null}
      </Card>
    </li>
  );
}

/** My parcels (L4 4.2 §2, D-073): the ones waiting at the desk first with their pick-up code, then the history. */
export async function ParcelList({
  parcels,
  locale,
  showUnit,
}: {
  parcels: Parcel[];
  locale: Locale;
  showUnit: boolean;
}) {
  const t = await getTranslations("resident.community.parcels");
  const waiting = parcels.filter((p) => p.status === "received" || p.status === "notified");
  const past = parcels.filter((p) => p.status !== "received" && p.status !== "notified");
  return (
    <div className="flex flex-col gap-5 py-5" data-testid="parcels">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      {parcels.length === 0 ? <EmptyState icon={IconParcel} title={t("empty")} description={t("emptyBody")} /> : null}
      {waiting.length ? (
        <section aria-labelledby="parcels-waiting" className="flex flex-col gap-2">
          <h2 id="parcels-waiting" className="font-semibold">
            {t("waiting")}
          </h2>
          <ul className="flex flex-col gap-3" role="list">
            {waiting.map((p) => (
              <ParcelCard key={p.id} parcel={p} locale={locale} showUnit={showUnit} />
            ))}
          </ul>
        </section>
      ) : null}
      {past.length ? (
        <section aria-labelledby="parcels-past" className="flex flex-col gap-2">
          <h2 id="parcels-past" className="font-semibold">
            {t("history")}
          </h2>
          <ul className="flex flex-col gap-3" role="list">
            {past.map((p) => (
              <ParcelCard key={p.id} parcel={p} locale={locale} showUnit={showUnit} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
