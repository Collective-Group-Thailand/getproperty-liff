import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { loadLease, pageLocale } from "@/features/resident/lease/data";
import { NoticeForm } from "@/features/resident/lease/NoticeForm";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";

export async function generateMetadata() {
  const t = await getTranslations("resident.lease.noticeForm");
  return { title: t("title") };
}

/** The lessee's 30-day move-out notice (D-020) — only when the API offers `give-notice`. */
export default async function NoticePage({ params }: { params: Promise<{ leaseId: string }> }) {
  const { leaseId } = await params;
  const [t, locale, lease] = await Promise.all([getTranslations("resident.lease"), pageLocale(), loadLease(leaseId)]);
  if (lease.error) {
    return (
      <ResidentShell active={null}>
        <ProblemPage error={lease.error} />
      </ResidentShell>
    );
  }
  const l = lease.data;
  return (
    <ResidentShell active={null}>
      <BackLink href={`/lease/${l.id}`}>{t("back.lease")}</BackLink>
      {l.nextActions.includes("give-notice") ? (
        // CONTRACT-REQUEST #7: the earliest date only when the API sends it.
        <NoticeForm lease={l} earliest={l.noticeEarliestDate ?? null} locale={locale} />
      ) : (
        <div className="flex flex-col gap-4 py-6" data-testid="notice-unavailable">
          <Callout tone="info" title={t("noticeForm.unavailableTitle")}>
            {l.notice ? t("noticeForm.alreadyGiven") : t("noticeForm.unavailableBody")}
          </Callout>
          <Button asChild size="lg" block>
            <Link href={`/lease/${l.id}`}>{t("noticeForm.done.back")}</Link>
          </Button>
        </div>
      )}
    </ResidentShell>
  );
}
