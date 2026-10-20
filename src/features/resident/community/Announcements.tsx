import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDate, formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { Badge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { Icon } from "@/ui/icons";
import { IconAnnounce } from "@/ui/icons/glyphs/announce";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";
import { IconTag } from "@/ui/icons/glyphs/tag";

import type { Announcement } from "./data";
import { MarkAnnouncementRead } from "./MarkAnnouncementRead";

/** Announcements of my buildings (D-073, D-212): pinned first as the API orders them; unread ones flagged. */
export async function AnnouncementList({ items, locale }: { items: Announcement[]; locale: Locale }) {
  const t = await getTranslations("resident.community.announcements");
  return (
    <div className="flex flex-col gap-4 py-5" data-testid="announcements">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      {items.length === 0 ? (
        <EmptyState icon={IconAnnounce} title={t("empty")} description={t("emptyBody")} />
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {items.map((a) => (
            <li key={a.id}>
              <Link
                href={`/announcements/${a.id}`}
                className="border-border bg-surface rounded-card flex min-h-12 items-center gap-3 border p-3"
                data-testid="announcement-item"
                data-read={a.readAt ? "true" : "false"}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    {a.pinned ? (
                      <Badge tone="info" size="sm" icon={IconTag}>
                        {t("pinned")}
                      </Badge>
                    ) : null}
                    {!a.readAt ? (
                      <Badge tone="primary" size="sm">
                        {t("unread")}
                      </Badge>
                    ) : null}
                  </span>
                  <span className={a.readAt ? "font-medium" : "font-semibold"}>{a.title}</span>
                  <span className="text-muted line-clamp-2 text-sm">{a.body}</span>
                  <span className="text-muted text-xs">
                    {t("published", { date: formatDate(a.publishedAt, locale) })}
                  </span>
                </span>
                <Icon icon={IconChevronRight} className="text-muted shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One announcement — also the target of the LINE message about it (`liff.state=/announcements/{id}`). Opening it
 * records my read receipt once (`…/actions/read`; the first read counts, D-212).
 */
export async function AnnouncementDetail({ item, locale }: { item: Announcement; locale: Locale }) {
  const t = await getTranslations("resident.community.announcements");
  return (
    <Card
      as="article"
      padding="md"
      className="flex flex-col gap-3"
      data-testid="announcement-detail"
      lang={item.language}
    >
      {item.pinned ? (
        <Badge tone="info" size="sm" icon={IconTag} className="self-start">
          {t("pinned")}
        </Badge>
      ) : null}
      <h1 className="font-display text-2xl font-semibold">{item.title}</h1>
      <p className="text-muted text-sm">{t("published", { date: formatDateTime(item.publishedAt, locale) })}</p>
      <p className="whitespace-pre-line">{item.body}</p>
      {item.readAt ? (
        <p className="text-muted text-xs" data-testid="announcement-read">
          {t("readAt", { date: formatDateTime(item.readAt, locale) })}
        </p>
      ) : (
        <MarkAnnouncementRead announcementId={item.id} />
      )}
    </Card>
  );
}
