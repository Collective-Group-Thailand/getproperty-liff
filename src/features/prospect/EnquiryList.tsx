import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { VIEWING_STATUS } from "@/domain/status/viewing";
import { formatDateTime } from "@/i18n/format";
import { isLocale, type Locale } from "@/i18n/routing";
import { StatusBadge } from "@/ui/components/Badge";
import { EmptyState } from "@/ui/components/EmptyState";
import { Icon } from "@/ui/icons";
import { IconBell } from "@/ui/icons/glyphs/bell";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";
import { IconInbox } from "@/ui/icons/glyphs/inbox";
import { IconShield } from "@/ui/icons/glyphs/shield";
import { IconReceipt } from "@/ui/icons/glyphs/receipt";

import { liveViewing, sortEnquiries, type Enquiry } from "./model";

async function Item({ enquiry, locale }: { enquiry: Enquiry; locale: Locale }) {
  const [t, root] = await Promise.all([getTranslations("prospect.rent.mine"), getTranslations()]);
  const last = enquiry.messages.at(-1);
  const next = liveViewing(enquiry);
  const status = next ? VIEWING_STATUS[next.state] : null;
  return (
    <li>
      <Link
        href={`/rent/enquiries/${enquiry.id}`}
        className="border-border bg-surface rounded-card flex min-h-12 items-center gap-3 border p-3"
        data-testid="enquiry-item"
        data-open={enquiry.open || undefined}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="font-medium">{enquiry.listing.titleTh}</span>
          <span className="text-muted text-xs">{enquiry.listing.ownerName}</span>
          <span className="text-muted line-clamp-2 text-sm">
            {last ? (last.author === "prospect" ? t("you", { text: last.body }) : last.body) : t("noMessage")}
          </span>
          {next && status ? (
            <span className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted">{t("viewing", { date: formatDateTime(next.startsAt, locale) })}</span>
              <StatusBadge status={status} label={root(status.labelKey)} size="sm" />
            </span>
          ) : null}
        </span>
        <Icon icon={IconChevronRight} className="text-muted shrink-0" />
      </Link>
    </li>
  );
}

/** My enquiries (L5 5.1 §2): the conversations still going first, then the ones the owner closed. */
export async function EnquiryList({
  enquiries,
  identityVerified = null,
  recommendations = null,
}: {
  enquiries: Enquiry[];
  /** D-267: whether I verified my identity (null when it could not be read). */
  identityVerified?: boolean | null;
  /** GL1 (D-300): whether I receive recommended places (null when it could not be read). */
  recommendations?: "on" | "off" | "outdated" | null;
}) {
  const [t, rec, current] = await Promise.all([
    getTranslations("prospect.rent.mine"),
    getTranslations("recommendations.entry"),
    getLocale(),
  ]);
  const locale = isLocale(current) ? current : "th";
  const { open, closed } = sortEnquiries(enquiries);
  return (
    <div className="flex flex-col gap-5 py-5" data-testid="enquiries">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("lead")}</p>
      </div>
      {identityVerified === null ? null : (
        <Link
          href="/rent/verification"
          className="border-border bg-surface rounded-card flex min-h-12 items-center gap-3 border p-3"
          data-testid="enquiries-verification"
          data-verified={identityVerified || undefined}
        >
          <Icon icon={IconShield} className={identityVerified ? "text-primary shrink-0" : "text-muted shrink-0"} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">{identityVerified ? t("verified") : t("verify")}</span>
            <span className="text-muted text-sm">{identityVerified ? t("verifiedHint") : t("verifyHint")}</span>
          </span>
          <Icon icon={IconChevronRight} className="text-muted shrink-0" />
        </Link>
      )}
      <Link
        href="/rent/rent-record"
        className="border-border bg-surface rounded-card flex min-h-12 items-center gap-3 border p-3"
        data-testid="enquiries-rent-record"
      >
        <Icon icon={IconReceipt} className="text-muted shrink-0" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{t("rentRecord")}</span>
          <span className="text-muted text-sm">{t("rentRecordHint")}</span>
        </span>
        <Icon icon={IconChevronRight} className="text-muted shrink-0" />
      </Link>
      <Link
        href="/rent/recommendations"
        className="border-border bg-surface rounded-card flex min-h-12 items-center gap-3 border p-3"
        data-testid="enquiries-recommendations"
        data-state={recommendations ?? undefined}
      >
        <Icon icon={IconBell} className={recommendations === "on" ? "text-primary shrink-0" : "text-muted shrink-0"} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-medium">{rec("title")}</span>
          <span className="text-muted text-sm">
            {recommendations === "on" ? rec("on") : recommendations === null ? rec("unknown") : rec("off")}
          </span>
        </span>
        <Icon icon={IconChevronRight} className="text-muted shrink-0" />
      </Link>
      {enquiries.length === 0 ? <EmptyState icon={IconInbox} title={t("empty")} description={t("emptyHint")} /> : null}
      {[
        { key: "open", list: open, label: t("open") },
        { key: "closed", list: closed, label: t("closed") },
      ].map(({ key, list, label }) =>
        list.length ? (
          <section key={key} aria-labelledby={`enquiries-${key}`} className="flex flex-col gap-2">
            <h2 id={`enquiries-${key}`} className="font-semibold">
              {label}
            </h2>
            <ul className="flex flex-col gap-2" role="list">
              {list.map((enquiry) => (
                <Item key={enquiry.id} enquiry={enquiry} locale={locale} />
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
}
