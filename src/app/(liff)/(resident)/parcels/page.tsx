import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { loadParcels } from "@/features/resident/community/data";
import { ParcelList } from "@/features/resident/community/Parcels";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.community.parcels");
  return { title: t("title") };
}

/** My parcels with the pick-up code (L4 4.2 §2) — where the landlord has the module (`parcels`). */
export default async function ParcelsPage() {
  const [actor, locale] = await Promise.all([getActor(), pageLocale()]);
  if (actor.status !== "signed-in") return null;
  if (!actor.entitlements.has("parcels")) notFound();
  const loaded = await loadParcels();
  return (
    <ResidentShell active={null}>
      {loaded.error ? (
        <ProblemPage error={loaded.error} />
      ) : (
        <ParcelList parcels={loaded.data} locale={locale} showUnit={actor.me.units.length > 1} />
      )}
    </ResidentShell>
  );
}
