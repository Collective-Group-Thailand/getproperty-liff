import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BookingPicker } from "@/features/resident/community/BookingPicker";
import { loadAvailability } from "@/features/resident/community/data";
import { FacilityFacts } from "@/features/resident/community/Facilities";
import { bookingDays, daySlots, slotState } from "@/features/resident/community/slots";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { currentTime } from "@/features/shared/time";
import { formatDate } from "@/i18n/format";
import { getActor } from "@/lib/auth/actor";
import { cn } from "@/ui/lib/cn";

export async function generateMetadata() {
  const t = await getTranslations("resident.community.facilities");
  return { title: t("title") };
}

/**
 * Book a facility (L4, D-212): the days the policy allows (today first), the slots of the chosen day with what is
 * taken (`…/availability?date=`, other units unnamed), and the booking. `?date=` keeps the day in the URL.
 */
export default async function FacilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ facilityId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ facilityId }, query, actor, locale, t] = await Promise.all([
    params,
    searchParams,
    getActor(),
    pageLocale(),
    getTranslations("resident.community.facilities"),
  ]);
  if (actor.status !== "signed-in") return null;
  if (!actor.entitlements.has("announcements") || !actor.unit) notFound();
  const now = currentTime();
  const today = bookingDays({ maxAdvanceDays: 1 }, now)[0]!;
  const wanted = typeof query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : today;
  const loaded = await loadAvailability(facilityId, wanted);
  if (loaded.error) {
    return (
      <ResidentShell active={null}>
        <BackLink href="/facilities">{t("back")}</BackLink>
        <ProblemPage error={loaded.error} />
      </ResidentShell>
    );
  }
  const { facility, busy, date } = loaded.data;
  const days = bookingDays(facility.bookingPolicy, now);
  const slots = daySlots(facility.bookingPolicy, date);
  const states = slots.map((slot) => slotState(slot, busy, now));
  return (
    <ResidentShell active={null}>
      <BackLink href="/facilities">{t("back")}</BackLink>
      <div className="flex flex-col gap-4 pb-6" data-testid="facility">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold">{facility.name}</h1>
          <p className="text-muted">{t(`kind.${facility.kind}`)}</p>
          <FacilityFacts facility={facility} />
        </div>
        <nav aria-label={t("day")}>
          <ul className="flex flex-wrap gap-2" role="list">
            {days.map((day) => (
              <li key={day}>
                <Link
                  href={`/facilities/${facility.id}?date=${day}`}
                  aria-current={day === date ? "date" : undefined}
                  className={cn(
                    "rounded-control border-border flex min-h-12 items-center border px-3 text-sm",
                    day === date ? "bg-primary text-primary-fg border-primary font-semibold" : "bg-surface",
                  )}
                  data-testid="facility-day"
                >
                  {formatDate(`${day}T12:00:00+07:00`, locale, { style: "dayMonth" })}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <section aria-labelledby="slots-title" className="flex flex-col gap-3">
          <h2 id="slots-title" className="font-semibold">
            {t("slots", { date: formatDate(`${date}T12:00:00+07:00`, locale, { style: "long" }) })}
          </h2>
          <BookingPicker
            key={date}
            facilityId={facility.id}
            unitId={actor.unit.unitId}
            slots={slots}
            states={states}
            policy={facility.bookingPolicy}
          />
        </section>
      </div>
    </ResidentShell>
  );
}
