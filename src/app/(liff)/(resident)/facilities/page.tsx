import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { loadBookings, loadFacilities } from "@/features/resident/community/data";
import { FacilityList } from "@/features/resident/community/Facilities";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.community.facilities");
  return { title: t("title") };
}

/**
 * Facilities of the selected unit's building and my bookings (L4, D-073). The contract has no `facilities`
 * entitlement (CONTRACT-REQUEST #27): the community module (`announcements`) stands for it.
 */
export default async function FacilitiesPage() {
  const [actor, locale] = await Promise.all([getActor(), pageLocale()]);
  if (actor.status !== "signed-in") return null;
  if (!actor.entitlements.has("announcements") || !actor.unit) notFound();
  const [facilities, bookings] = await Promise.all([loadFacilities(actor.unit.unitId), loadBookings()]);
  const error = facilities.error ?? bookings.error;
  return (
    <ResidentShell active={null}>
      {error ? (
        <ProblemPage error={error} />
      ) : (
        <FacilityList facilities={facilities.data!} bookings={bookings.data!} locale={locale} />
      )}
    </ResidentShell>
  );
}
