import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { Badge } from "@/ui/components/Badge";
import { Icon } from "@/ui/icons";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";

import type { HistoryItem } from "./model";

/**
 * What was sent to me (D-300): when, the ad label exactly as the API words it, who paid for it and the listings — a
 * listing opens while it is still public, otherwise it says so.
 */
export async function HistoryList({ items, locale }: { items: HistoryItem[]; locale: Locale }) {
  const t = await getTranslations("recommendations.history");
  return (
    <ul className="flex flex-col" role="list" data-testid="recommendations-history">
      {items.map((item) => (
        <li
          key={item.id}
          className="border-border border-b py-3 last:border-b-0"
          data-testid="recommendations-history-item"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="warning" size="sm">
              {item.label}
            </Badge>
            <span className="text-muted text-sm">{formatDateTime(item.sentAt, locale)}</span>
          </div>
          <p className="text-muted mt-1 text-sm">{t("sponsor", { name: item.sponsor })}</p>
          <ul className="mt-1 flex flex-col" role="list">
            {item.listings.map((listing) => (
              <li key={listing.slug}>
                {listing.public ? (
                  <Link
                    href={`/rent/${encodeURIComponent(listing.slug)}`}
                    className="text-primary flex min-h-12 items-center gap-2 font-medium"
                  >
                    <span className="min-w-0 flex-1">{listing.title}</span>
                    <Icon icon={IconChevronRight} className="shrink-0" />
                  </Link>
                ) : (
                  <span className="flex min-h-12 flex-wrap items-center gap-2">
                    <span className="text-muted">{listing.title}</span>
                    <Badge tone="neutral" size="sm">
                      {t("gone")}
                    </Badge>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
