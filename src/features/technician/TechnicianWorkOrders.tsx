import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { WORK_ORDER_STATUS } from "@/domain/status/workOrder";
import { formatClock } from "@/features/shared/time";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { TechnicianMe } from "@/lib/api/types";
import { Badge, StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { Icon } from "@/ui/icons";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconTicket } from "@/ui/icons/glyphs/ticket";

import { groupWorkOrders, type WorkOrder } from "./model";
import { RefreshWork } from "./RefreshWork";

async function Item({ item, locale }: { item: WorkOrder; locale: Locale }) {
  const [t, root] = await Promise.all([getTranslations("technician.workOrders"), getTranslations()]);
  const status = WORK_ORDER_STATUS[item.status];
  return (
    <li>
      <Link
        href={`/technician/work-orders/${item.id}`}
        className="border-border bg-surface rounded-card flex min-h-12 items-center gap-3 border p-3"
        data-testid="work-order-item"
        data-status={item.status}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium">{t("item", { title: item.title })}</span>
          <span className="text-muted text-sm">
            {item.unitNo
              ? t("where", { unit: item.unitNo, building: item.buildingName })
              : t("whereBuilding", { building: item.buildingName })}
          </span>
          {item.scheduledAt ? (
            <span className="text-sm tabular-nums">
              {item.scheduledUntil
                ? t("when", {
                    date: formatDate(item.scheduledAt, locale, { style: "dayMonth" }),
                    from: formatClock(item.scheduledAt),
                    to: formatClock(item.scheduledUntil),
                  })
                : t("whenStart", { date: formatDate(item.scheduledAt, locale) })}
            </span>
          ) : null}
          <span className="flex flex-wrap gap-2">
            <StatusBadge status={status} label={root(status.labelKey)} size="sm" />
            {item.priority === "urgent" || item.priority === "high" ? (
              <Badge tone="warning" size="sm">
                {t(`priority.${item.priority}`)}
              </Badge>
            ) : null}
          </span>
        </span>
        <Icon icon={IconChevronRight} className="text-muted shrink-0" />
      </Link>
    </li>
  );
}

/**
 * "My work orders" (L4 4.4 §2, A4.3): today's visits first, then the next ones, the unscheduled and the finished
 * ones (until the owner verifies them). A work order assigned after sign-in arrives with the next token (D-210):
 * "check for new work" rotates the technician session and reloads. A technician signed in by SMS whose phone match
 * still waits for the office (`linkRequestsPending`, D-226, D-228) sees "waiting for the office to confirm you"
 * instead of the empty list.
 */
export async function TechnicianWorkOrders({
  me,
  items,
  locale,
  now,
}: {
  me: TechnicianMe;
  items: WorkOrder[];
  locale: Locale;
  now: number;
}) {
  const t = await getTranslations("technician.workOrders");
  const groups = groupWorkOrders(items, now);
  // D-226 / LIFF #29: signed in by SMS, matched to parties the office has not confirmed yet — not "no work yet".
  const waiting = items.length === 0 && me.workOrderIds.length === 0 && me.linkRequestsPending > 0;
  const sections = [
    ["today", groups.today],
    ["upcoming", groups.upcoming],
    ["unscheduled", groups.unscheduled],
    ["finished", groups.finished],
  ] as const;
  return (
    <div className="flex flex-col gap-5 py-6" data-testid="technician-home">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("greeting", { name: me.user.displayName })}</p>
      </div>
      {waiting ? (
        <Card
          as="section"
          aria-labelledby="technician-pending-title"
          padding="lg"
          className="bg-primary-subtle border-transparent"
          data-testid="technician-link-pending"
        >
          <h2 id="technician-pending-title" className="text-primary-subtle-fg flex items-center gap-2 font-semibold">
            <Icon icon={IconClock} />
            {t("pending.title")}
          </h2>
          <p className="mt-2 text-sm">{t("pending.body", { count: me.linkRequestsPending })}</p>
          <p className="text-muted mt-2 text-sm">{t("pending.next")}</p>
        </Card>
      ) : null}
      <RefreshWork />
      {items.length === 0 && !waiting ? (
        <EmptyState icon={IconTicket} title={t("empty")} description={t("body")} />
      ) : null}
      {sections.map(([key, list]) =>
        list.length ? (
          <section key={key} aria-labelledby={`wo-${key}`} className="flex flex-col gap-2">
            <h2 id={`wo-${key}`} className="font-semibold">
              {t(key)}
            </h2>
            <ul className="flex flex-col gap-2" role="list">
              {list.map((item) => (
                <Item key={item.id} item={item} locale={locale} />
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
