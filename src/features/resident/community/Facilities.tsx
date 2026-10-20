import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { BOOKING_STATUS } from "@/domain/status/booking";
import { formatClock } from "@/features/shared/time";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { Icon } from "@/ui/icons";
import { IconBuilding } from "@/ui/icons/glyphs/building";
import { IconCalendar } from "@/ui/icons/glyphs/calendar";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";

import { CancelBooking } from "./CancelBooking";
import type { Booking, Facility } from "./data";
import { POLICY_DEFAULTS } from "./slots";

/** The policy as the resident reads it: opening hours, people, weekly quota, approval (the API's values). */
export async function FacilityFacts({ facility }: { facility: Facility }) {
  const t = await getTranslations("resident.community.facilities");
  const p = facility.bookingPolicy;
  return (
    <ul className="text-muted flex flex-col gap-0.5 text-sm" role="list">
      <li>{t("hours", { from: p.openFrom ?? POLICY_DEFAULTS.openFrom, to: p.openTo ?? POLICY_DEFAULTS.openTo })}</li>
      {facility.capacity ? <li>{t("capacity", { count: facility.capacity })}</li> : null}
      {p.maxPerUnitPerWeek ? <li>{t("quota", { count: p.maxPerUnitPerWeek })}</li> : null}
      {p.requiresApproval ? <li>{t("approval")}</li> : null}
    </ul>
  );
}

/** Bookable facilities of my building and my bookings with cancel (L4, D-073, D-212). */
export async function FacilityList({
  facilities,
  bookings,
  locale,
}: {
  facilities: Facility[];
  bookings: Booking[];
  locale: Locale;
}) {
  const [t, root] = await Promise.all([getTranslations("resident.community.facilities"), getTranslations()]);
  const live = bookings.filter((b) => b.status === "requested" || b.status === "confirmed");
  return (
    <div className="flex flex-col gap-5 py-5" data-testid="facilities">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      {facilities.length === 0 ? (
        <EmptyState icon={IconBuilding} title={t("empty")} description={t("emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {facilities.map((f) => (
            <li key={f.id}>
              <Link
                href={`/facilities/${f.id}`}
                className="border-border bg-surface rounded-card flex min-h-12 items-center gap-3 border p-3"
                data-testid="facility-item"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-medium">{f.name}</span>
                  <span className="text-muted text-sm">{t(`kind.${f.kind}`)}</span>
                  <FacilityFacts facility={f} />
                </span>
                <Icon icon={IconChevronRight} className="text-muted shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <section aria-labelledby="bookings-title" className="flex flex-col gap-2" data-testid="my-bookings">
        <h2 id="bookings-title" className="flex items-center gap-2 font-semibold">
          <Icon icon={IconCalendar} />
          {t("mine")}
        </h2>
        {bookings.length === 0 ? <p className="text-muted text-sm">{t("mineEmpty")}</p> : null}
        <ul className="flex flex-col gap-2" role="list">
          {bookings.map((b) => {
            const status = BOOKING_STATUS[b.status];
            const when = {
              date: formatDate(b.startsAt, locale),
              from: formatClock(b.startsAt),
              to: formatClock(b.endsAt),
            };
            return (
              <li key={b.id}>
                <Card padding="md" className="flex flex-col gap-2" data-testid="booking" data-status={b.status}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{b.facilityName}</p>
                    <StatusBadge status={status} label={root(status.labelKey)} size="sm" />
                  </div>
                  <p className="text-sm">{t("when", when)}</p>
                  {live.includes(b) ? (
                    <CancelBooking bookingId={b.id} summary={{ facility: b.facilityName, ...when }} />
                  ) : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
