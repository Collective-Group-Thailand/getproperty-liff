import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { SERVICE_REQUEST_STATUS } from "@/domain/status/serviceRequest";
import { formatDate, formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { PageMeta } from "@/lib/api/types";
import { StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { EmptyState } from "@/ui/components/EmptyState";
import { Icon } from "@/ui/icons";
import { IconAdd } from "@/ui/icons/glyphs/add";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";
import { IconTicket } from "@/ui/icons/glyphs/ticket";

import { categoryName, splitRequests, type ServiceRequest } from "./model";

async function Item({ request, locale }: { request: ServiceRequest; locale: Locale }) {
  const [t, root, cat] = await Promise.all([
    getTranslations("resident.requests.list"),
    getTranslations(),
    getTranslations("resident.requests.category"),
  ]);
  const status = SERVICE_REQUEST_STATUS[request.status];
  return (
    <li>
      <Link
        href={`/requests/${request.id}`}
        className="border-border bg-surface rounded-card flex min-h-12 items-center gap-3 border p-3"
        data-testid="request-item"
        data-status={request.status}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium">
            {t("item", { category: categoryName(request.category, locale, (key) => cat(key)), ref: request.ref })}
          </span>
          <span className="text-muted line-clamp-2 text-sm">{request.description}</span>
          <span className="text-muted text-xs">
            {request.visitAt && ["assigned", "in_progress"].includes(request.status)
              ? t("visit", { date: formatDateTime(request.visitAt, locale) })
              : t("reported", { date: formatDate(request.createdAt, locale) })}
          </span>
          <StatusBadge status={status} label={root(status.labelKey)} size="sm" className="self-start" />
        </span>
        <Icon icon={IconChevronRight} className="text-muted shrink-0" />
      </Link>
    </li>
  );
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
  return (
    <div className="flex flex-col gap-5 py-5" data-testid="requests">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      <Button asChild size="lg" block iconStart={IconAdd}>
        <Link href="/requests/new" data-testid="request-new">
          {t("new")}
        </Link>
      </Button>
      {requests.length === 0 ? <EmptyState icon={IconTicket} title={t("empty")} description={t("emptyBody")} /> : null}
      {open.length ? (
        <section aria-labelledby="requests-open" className="flex flex-col gap-2">
          <h2 id="requests-open" className="font-semibold">
            {t("open")}
          </h2>
          <ul className="flex flex-col gap-2" role="list">
            {open.map((request) => (
              <Item key={request.id} request={request} locale={locale} />
            ))}
          </ul>
        </section>
      ) : null}
      {past.length ? (
        <section aria-labelledby="requests-past" className="flex flex-col gap-2">
          <h2 id="requests-past" className="font-semibold">
            {t("history")}
          </h2>
          <ul className="flex flex-col gap-2" role="list">
            {past.map((request) => (
              <Item key={request.id} request={request} locale={locale} />
            ))}
          </ul>
        </section>
      ) : null}
      {hasMore ? (
        <Button asChild variant="secondary" size="lg" block>
          <Link href={`/requests?page=${page + 1}`}>{t("more")}</Link>
        </Button>
      ) : null}
    </div>
  );
}
