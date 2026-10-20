import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { AnnouncementDetail } from "@/features/resident/community/Announcements";
import { loadAnnouncements } from "@/features/resident/community/data";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconAnnounce } from "@/ui/icons/glyphs/announce";

export async function generateMetadata() {
  const t = await getTranslations("resident.community.announcements");
  return { title: t("title") };
}

/**
 * One announcement — the LINE message about it deep-links here (`liff.state=/announcements/{id}`, L4 4.2 §1). The
 * contract lists announcements only, so it is found in my list; one that was archived or expired says so.
 */
export default async function AnnouncementPage({ params }: { params: Promise<{ announcementId: string }> }) {
  const [{ announcementId }, actor, locale, t] = await Promise.all([
    params,
    getActor(),
    pageLocale(),
    getTranslations("resident.community.announcements"),
  ]);
  if (actor.status !== "signed-in") return null;
  if (!actor.entitlements.has("announcements")) notFound();
  const loaded = await loadAnnouncements();
  const item = loaded.data?.find((a) => a.id === announcementId);
  return (
    <ResidentShell active={null}>
      <BackLink href="/announcements">{t("back")}</BackLink>
      <div className="pb-6">
        {loaded.error ? (
          <ProblemPage error={loaded.error} />
        ) : item ? (
          <AnnouncementDetail item={item} locale={locale} />
        ) : (
          <EmptyState icon={IconAnnounce} title={t("notFound")} description={t("notFoundBody")} />
        )}
      </div>
    </ResidentShell>
  );
}
