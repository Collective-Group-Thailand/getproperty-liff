import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDate, formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { List, Screen, ScreenHeader } from "@/features/shared/Screen";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconAnnounce } from "@/ui/icons/glyphs/announce";
import { IconTag } from "@/ui/icons/glyphs/tag";

import type { Announcement } from "./data";
import { MarkAnnouncementRead } from "./MarkAnnouncementRead";

/** Announcements of my buildings (D-073, D-212): pinned first as the API orders them; unread ones flagged. */
export async function AnnouncementList({ items, locale }: { items: Announcement[]; locale: Locale }) {
  const t = await getTranslations("resident.community.announcements");
  const home = await getTranslations("resident.nav");
  return (
    <Screen testId="announcements">
      <ScreenHeader title={t("title")} lede={t("lead")} />
      {items.length === 0 ? (
        <EmptyState
          variant="card"
          icon={IconAnnounce}
          title={t("empty")}
          description={t("emptyBody")}
          action={
            <Button asChild variant="secondary">
              <Link href="/">{home("home")}</Link>
            </Button>
          }
        />
      ) : (
        <List
          rows={items.map((a) => ({
            key: a.id,
            href: `/announcements/${a.id}`,
            testId: "announcement-item",
            data: { "data-read": a.readAt ? "true" : "false" },
            strong: !a.readAt,
            title: a.title,
            meta: (
              <>
                {a.pinned || !a.readAt ? (
                  <span className="my-1 flex flex-wrap gap-1.5">
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
                ) : null}
                <span className="line-clamp-2 block">{a.body}</span>
                <span className="mt-0.5 block text-xs">
                  {t("published", { date: formatDate(a.publishedAt, locale) })}
                </span>
              </>
            ),
          }))}
        />
      )}
    </Screen>
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
