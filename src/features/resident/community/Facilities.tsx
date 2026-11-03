import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { BOOKING_STATUS } from "@/domain/status/booking";
import { formatClock } from "@/features/shared/time";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { Button } from "@/ui/components/Button";
import { List, Screen, ScreenHeader } from "@/features/shared/Screen";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconBuilding } from "@/ui/icons/glyphs/building";
import { IconCalendar } from "@/ui/icons/glyphs/calendar";

import { CancelBooking } from "./CancelBooking";
import type { Booking, Facility } from "./data";
import { POLICY_DEFAULTS } from "./slots";

/** The policy as the resident reads it: opening hours, people, weekly quota, approval (the API's values). */
export async function FacilityFacts({ facility }: { facility: Facility }) {
  const t = await getTranslations("resident.community.facilities");
  const p = facility.bookingPolicy;
  return (
    <ul className="text-muted flex flex-col text-sm" role="list">
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
  const [t, root, tiles] = await Promise.all([
    getTranslations("resident.community.facilities"),
    getTranslations(),
    getTranslations("resident.home.tiles"),
  ]);
  const live = bookings.filter((b) => b.status === "requested" || b.status === "confirmed");
  return (
    <Screen testId="facilities">
      <ScreenHeader title={t("title")} lede={t("lead")} />
      {facilities.length === 0 ? (
        <EmptyState
          variant="card"
          icon={IconBuilding}
          title={t("empty")}
          description={t("emptyBody")}
          action={
            <Button asChild variant="secondary">
              <Link href="/contacts">{tiles("contacts")}</Link>
            </Button>
          }
        />
      ) : (
        <List
          rows={await Promise.all(
            facilities.map(async (f) => ({
              key: f.id,
              href: `/facilities/${f.id}`,
              testId: "facility-item",
              icon: IconCalendar,
              title: f.name,
              meta: (
                <>
                  <span className="block">{t(`kind.${f.kind}`)}</span>
                  <FacilityFacts facility={f} />
                </>
              ),
            })),
          )}
        />
      )}
      <section aria-labelledby="bookings-title" className="flex flex-col gap-2" data-testid="my-bookings">
        <h2 id="bookings-title" className="text-muted text-sm font-semibold">
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
    </Screen>
  );
}
