import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { AnnouncementList } from "@/features/resident/community/Announcements";
import { loadAnnouncements } from "@/features/resident/community/data";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.community.announcements");
  return { title: t("title") };
}

/** Announcements of my buildings (L4 4.2 §1) — where the landlord has the module (`announcements`). */
export default async function AnnouncementsPage() {
  const [actor, locale] = await Promise.all([getActor(), pageLocale()]);
  if (actor.status !== "signed-in") return null;
  if (!actor.entitlements.has("announcements")) notFound();
  const loaded = await loadAnnouncements();
  return (
    <ResidentShell active={null}>
      {loaded.error ? <ProblemPage error={loaded.error} /> : <AnnouncementList items={loaded.data} locale={locale} />}
    </ResidentShell>
  );
}
