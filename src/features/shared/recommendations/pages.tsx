import "server-only";

import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { isLocale } from "@/i18n/routing";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconBell } from "@/ui/icons/glyphs/bell";
import { IconChevronLeft } from "@/ui/icons/glyphs/chevron-left";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";

import { loadAreas, loadHistory, loadRecommendations } from "./data";
import { HistoryList } from "./HistoryList";
import { basePath, HISTORY_PER_PAGE, HISTORY_PREVIEW, hasOlder, pageFrom, type RecommendationsAudience } from "./model";
import { RecommendationsScreen } from "./RecommendationsScreen";

type SearchParams = Record<string, string | string[] | undefined>;

async function locale() {
  const current = await getLocale();
  return isLocale(current) ? current : "th";
}

/** Where "back" goes: the profile for residents, my enquiries for prospects. */
async function back(audience: RecommendationsAudience) {
  if (audience === "resident") {
    const t = await getTranslations("resident.profile");
    return <BackLink href="/profile">{t("title")}</BackLink>;
  }
  const t = await getTranslations("prospect.rent.mine");
  return <BackLink href="/rent/enquiries">{t("title")}</BackLink>;
}

/** The settings screen with its data (consent + preferences, areas, latest history) for one audience. */
export async function RecommendationsPage({
  audience,
  searchParams,
}: {
  audience: RecommendationsAudience;
  searchParams: SearchParams;
}) {
  const [loaded, areas, history, current, backLink] = await Promise.all([
    loadRecommendations(audience),
    loadAreas(),
    loadHistory(audience, 1, HISTORY_PREVIEW),
    locale(),
    back(audience),
  ]);
  const notice = searchParams.stopped === "1" ? "stopped" : searchParams.saved === "1" ? "saved" : null;
  return (
    <>
      {backLink}
      {loaded.data ? (
        <RecommendationsScreen
          audience={audience}
          data={loaded.data}
          areas={areas}
          history={
            history.data ? { items: history.data.items, total: history.data.meta.total } : { error: history.error }
          }
          locale={current}
          notice={notice}
        />
      ) : (
        <ProblemPage error={loaded.error} />
      )}
    </>
  );
}

/** Everything sent to me, paged like the API (`?page=`). */
export async function RecommendationsHistoryPage({
  audience,
  searchParams,
}: {
  audience: RecommendationsAudience;
  searchParams: SearchParams;
}) {
  const page = pageFrom(searchParams.page);
  const [t, root, loaded, current] = await Promise.all([
    getTranslations("recommendations.history"),
    getTranslations("recommendations"),
    loadHistory(audience, page, HISTORY_PER_PAGE),
    locale(),
  ]);
  const base = basePath(audience);
  return (
    <div className="flex flex-col gap-4 py-3" data-testid="recommendations-history-page">
      <BackLink href={base}>{root("title")}</BackLink>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      {loaded.error ? (
        <ProblemPage error={loaded.error} />
      ) : loaded.data.items.length === 0 ? (
        <EmptyState icon={IconBell} title={t("empty")} />
      ) : (
        <Card as="section" padding="md" aria-label={t("title")}>
          <HistoryList items={loaded.data.items} locale={current} />
        </Card>
      )}
      {loaded.data && (page > 1 || hasOlder(loaded.data.meta, page)) ? (
        <nav aria-label={t("pages")} className="flex justify-between gap-2">
          {page > 1 ? (
            <Button asChild variant="secondary" size="lg" iconStart={IconChevronLeft}>
              <Link href={page === 2 ? `${base}/history` : `${base}/history?page=${page - 1}`}>{t("newer")}</Link>
            </Button>
          ) : (
            <span />
          )}
          {hasOlder(loaded.data.meta, page) ? (
            <Button asChild variant="secondary" size="lg" iconEnd={IconChevronRight}>
              <Link href={`${base}/history?page=${page + 1}`} data-testid="recommendations-history-older">
                {t("older")}
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
