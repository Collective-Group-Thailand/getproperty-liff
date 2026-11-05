import { useTranslations } from "next-intl";
import Link from "next/link";

import { EmptyAction } from "@/features/shared/EmptyAction";
import { List, Screen, ScreenHeader } from "@/features/shared/Screen";
import type { Locale } from "@/i18n/routing";
import type { PageMeta, Visit } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconChevronLeft } from "@/ui/icons/glyphs/chevron-left";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";
import { IconHistory } from "@/ui/icons/glyphs/history";

import { useVisitRow } from "./VisitorsScreen";

/** `/visitors/history` — every visit of the unit on screen, newest first, 25 a page (kept `retentionDays`, D-327). */
export function VisitHistory({
  visits,
  meta,
  page,
  retentionDays,
  today,
  locale,
}: {
  visits: Visit[];
  meta: PageMeta;
  page: number;
  retentionDays: number | null;
  today: string;
  locale: Locale;
}) {
  const t = useTranslations("resident.visitors.history");
  const back = useTranslations("resident.visitors.open");
  const row = useVisitRow(locale, today);
  const hasOlder = page * meta.perPage < meta.total;
  return (
    <Screen testId="visit-history">
      <ScreenHeader
        flush
        title={t("title")}
        lede={retentionDays ? t("retention", { days: retentionDays }) : undefined}
      />
      {visits.length ? (
        <List rows={visits.map(row)} />
      ) : (
        <EmptyState
          variant="card"
          icon={IconHistory}
          title={t("empty")}
          description={t("emptyBody")}
          action={<EmptyAction href="/visitors" label={back("back")} />}
        />
      )}
      {page > 1 || hasOlder ? (
        <nav className="flex items-center justify-between gap-3" aria-label={t("pages")}>
          {page > 1 ? (
            <Button asChild variant="ghost" iconStart={IconChevronLeft}>
              <Link href={`/visitors/history?page=${page - 1}`}>{t("newer")}</Link>
            </Button>
          ) : (
            <span />
          )}
          {hasOlder ? (
            <Button asChild variant="ghost" iconEnd={IconChevronRight}>
              <Link href={`/visitors/history?page=${page + 1}`}>{t("older")}</Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </Screen>
  );
}
