import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { LEASE_STATUS } from "@/domain/status/lease";
import { VIEWING_STATUS } from "@/domain/status/viewing";
import { ExternalLinkButton } from "@/features/shared/ExternalLinkButton";
import { formatDate, formatDateTime, formatTHB } from "@/i18n/format";
import { isLocale, type Locale } from "@/i18n/routing";
import { StatusBadge } from "@/ui/components/Badge";
import { Card } from "@/ui/components/Card";
import { Icon } from "@/ui/icons";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";
import { IconShield } from "@/ui/icons/glyphs/shield";

import type { LandlordToday } from "./data";
import { SendReminder } from "./SendReminder";
import { ViewingDecision } from "./ViewingDecision";

function Section({
  id,
  title,
  count,
  empty,
  children,
}: {
  id: string;
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <Card as="section" padding="md" aria-labelledby={id} className="flex flex-col gap-3" data-testid={id}>
      <h2 id={id} className="flex items-center justify-between gap-2 font-semibold">
        <span>{title}</span>
        {count > 0 ? (
          <span className="bg-primary-subtle text-primary-subtle-fg rounded-full px-2 text-sm tabular-nums">
            {count}
          </span>
        ) : null}
      </h2>
      {count === 0 ? <p className="text-muted text-sm">{empty}</p> : children}
    </Card>
  );
}

/**
 * A landlord's day in LINE (L5 5.3, D-251): enquiries to answer, viewings to confirm, money in, overdue rent to
 * remind, leases ending — each with the one action that fits a phone; the rest links to the web console.
 */
export async function LandlordHome({
  today,
  name,
  consoleUrl,
}: {
  today: LandlordToday;
  name: string;
  consoleUrl: string | undefined;
}) {
  const [t, root, current] = await Promise.all([getTranslations("landlord.home"), getTranslations(), getLocale()]);
  const locale: Locale = isLocale(current) ? current : "th";
  return (
    <div className="flex flex-col gap-4 py-5" data-testid="landlord-home">
      <div className="flex flex-col gap-1">
        <p className="text-muted text-sm">{t("greeting", { name })}</p>
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted">{t("intro")}</p>
      </div>

      <Section id="landlord-leads" title={t("leads.title")} count={today.leads.length} empty={t("leads.empty")}>
        <ul className="divide-border -mx-1 flex flex-col divide-y" role="list">
          {today.leads.map((lead) => (
            <li key={lead.id}>
              <Link
                href={`/landlord/leads/${lead.id}`}
                className="flex min-h-12 items-center justify-between gap-3 px-1 py-3"
                data-testid="landlord-lead"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate font-medium">{lead.prospect.name}</span>
                    {lead.prospect.identityVerified ? (
                      <Icon
                        icon={IconShield}
                        className="text-primary shrink-0"
                        label={t("leads.identityVerified")}
                        data-testid="landlord-lead-identity"
                      />
                    ) : null}
                  </span>
                  <span className="text-muted truncate text-sm">{lead.lastMessage ?? lead.listing.title}</span>
                  <span className="text-muted text-xs">
                    {t("leads.awaiting", { date: formatDateTime(lead.lastProspectAt, locale) })}
                  </span>
                </span>
                <span className="text-primary flex shrink-0 items-center gap-1 text-sm font-medium">
                  {t("leads.open")}
                  <Icon icon={IconChevronRight} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        id="landlord-viewings"
        title={t("viewings.title")}
        count={today.viewings.length}
        empty={t("viewings.empty")}
      >
        <ul className="flex flex-col gap-4" role="list">
          {today.viewings.map((viewing) => {
            const status = VIEWING_STATUS[viewing.state];
            return (
              <li key={viewing.id} className="flex flex-col gap-2" data-testid="landlord-viewing">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{viewing.prospectName}</span>
                    <span className="text-muted truncate text-sm">{viewing.listing.title}</span>
                    <time className="text-sm" dateTime={viewing.startsAt}>
                      {formatDateTime(viewing.startsAt, locale)}
                    </time>
                  </span>
                  <StatusBadge status={status} label={root(status.labelKey)} size="sm" />
                </div>
                <ViewingDecision viewingId={viewing.id} />
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        id="landlord-payments"
        title={t("payments.title")}
        count={today.payments.length}
        empty={t("payments.empty")}
      >
        <ul className="divide-border flex flex-col divide-y" role="list">
          {today.payments.map((payment) => (
            <li
              key={payment.id}
              className="flex items-center justify-between gap-3 py-2"
              data-testid="landlord-payment"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{payment.payerName ?? payment.unitNo ?? "—"}</span>
                <span className="text-muted text-xs">{formatDateTime(payment.paidAt, locale)}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums">{formatTHB(payment.amount, locale)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="landlord-overdue" title={t("overdue.title")} count={today.overdue.length} empty={t("overdue.empty")}>
        <ul className="flex flex-col gap-4" role="list">
          {today.overdue.map((invoice) => (
            <li key={invoice.id} className="flex flex-col gap-2" data-testid="landlord-overdue-invoice">
              <div className="flex items-start justify-between gap-3">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium">
                    {invoice.unitNo} · {invoice.billedPartyName}
                  </span>
                  <span className="text-muted text-xs">
                    {[
                      invoice.number,
                      invoice.dueDate ? t("overdue.due", { date: formatDate(invoice.dueDate, locale) }) : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">{formatTHB(invoice.balance, locale)}</span>
              </div>
              <SendReminder invoiceId={invoice.id} />
            </li>
          ))}
        </ul>
      </Section>

      <Section id="landlord-ending" title={t("ending.title")} count={today.ending.length} empty={t("ending.empty")}>
        <ul className="divide-border flex flex-col divide-y" role="list">
          {today.ending.map((lease) => {
            const status = LEASE_STATUS[lease.status];
            return (
              <li key={lease.id} className="flex flex-col gap-1 py-2" data-testid="landlord-ending-lease">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {[lease.unitNo, lease.lesseeName].filter(Boolean).join(" · ")}
                    </span>
                    <span className="text-muted text-xs">
                      {t("ending.ends", { date: formatDate(lease.endDate, locale) })}
                    </span>
                  </span>
                  <StatusBadge status={status} label={root(status.labelKey)} size="sm" />
                </div>
                {consoleUrl ? (
                  <ExternalLinkButton href={`${consoleUrl}/leases/${lease.id}`}>
                    {t("ending.manage")}
                  </ExternalLinkButton>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Section>

      {consoleUrl ? <ExternalLinkButton href={consoleUrl}>{t("openConsole")}</ExternalLinkButton> : null}
    </div>
  );
}
