import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { SERVICE_REQUEST_STATUS } from "@/domain/status/serviceRequest";
import { formatDate, formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { PageMeta } from "@/lib/api/types";
import { StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { EmptyState } from "@/ui/components/EmptyState";
import { ActionDock, List, Screen, ScreenHeader, Section, type ListRow } from "@/features/shared/Screen";
import { IconAdd } from "@/ui/icons/glyphs/add";
import { IconTicket } from "@/ui/icons/glyphs/ticket";

import { categoryName, splitRequests, type ServiceRequest } from "./model";

async function rowsOf(requests: ServiceRequest[], locale: Locale): Promise<ListRow[]> {
  const [t, root, cat] = await Promise.all([
    getTranslations("resident.requests.list"),
    getTranslations(),
    getTranslations("resident.requests.category"),
  ]);
  return requests.map((request) => {
    const status = SERVICE_REQUEST_STATUS[request.status];
    return {
      key: request.id,
      href: `/requests/${request.id}`,
      testId: "request-item",
      data: { "data-status": request.status },
      title: t("item", { category: categoryName(request.category, locale, (key) => cat(key)), ref: request.ref }),
      meta: (
        <>
          <span className="line-clamp-2 block">{request.description}</span>
          <span className="mt-0.5 block text-xs">
            {request.visitAt && ["assigned", "in_progress"].includes(request.status)
              ? t("visit", { date: formatDateTime(request.visitAt, locale) })
              : t("reported", { date: formatDate(request.createdAt, locale) })}
          </span>
        </>
      ),
      endMeta: <StatusBadge status={status} label={root(status.labelKey)} size="sm" />,
    };
  });
}

/** My repair requests (L4 4.1): open ones first, then the history; paged like the API. */
export async function RequestList({
  requests,
  meta,
  page,
  locale,
}: {
  requests: ServiceRequest[];
  meta: PageMeta;
  page: number;
  locale: Locale;
}) {
  const t = await getTranslations("resident.requests.list");
  const { open, past } = splitRequests(requests);
  const hasMore = page * meta.perPage < meta.total;
  const newLink = (
    <Link href="/requests/new" data-testid="request-new">
      {t("new")}
    </Link>
  );
  return (
    <Screen testId="requests">
      <ScreenHeader title={t("title")} lede={t("lead")} />
      {requests.length === 0 ? (
        <EmptyState
          variant="card"
          icon={IconTicket}
          title={t("empty")}
          description={t("emptyBody")}
          action={
            <Button asChild iconStart={IconAdd}>
              {newLink}
            </Button>
          }
        />
      ) : null}
      {open.length ? (
        <Section title={t("open")} titleId="requests-open">
          <List rows={await rowsOf(open, locale)} />
        </Section>
      ) : null}
      {past.length ? (
        <Section title={t("history")} titleId="requests-past">
          <List rows={await rowsOf(past, locale)} />
        </Section>
      ) : null}
      {hasMore ? (
        <Button asChild variant="secondary" size="lg" block>
          <Link href={`/requests?page=${page + 1}`}>{t("more")}</Link>
        </Button>
      ) : null}
      {requests.length ? (
        <ActionDock>
          <Button asChild size="xl" block iconStart={IconAdd}>
            {newLink}
          </Button>
        </ActionDock>
      ) : null}
    </Screen>
  );
}
