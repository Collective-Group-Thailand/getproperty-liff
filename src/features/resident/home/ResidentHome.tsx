import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { Due } from "@/features/resident/invoices/Due";
import { PayLauncher } from "@/features/resident/pay/PayLauncher";
import { dueState, needsAttention, openFirst } from "@/features/resident/invoices/model";
import { LEASE_STATUS } from "@/domain/status/lease";
import { formatDate, formatRelativeTime } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import type { InvoiceView } from "@/lib/api/types";
import type { InboxItem, ResidentEntitlement, ResidentMe, ResidentUnit } from "@/lib/api/types";
import type { ResidentNavEntitlements } from "@/lib/auth/entitlements";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { MoneyDisplay } from "@/ui/components/MoneyDisplay";
import { Icon, type IconGlyph } from "@/ui/icons";
import { IconAnnounce } from "@/ui/icons/glyphs/announce";
import { IconBell } from "@/ui/icons/glyphs/bell";
import { IconBill } from "@/ui/icons/glyphs/bill";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconCalendarCheck } from "@/ui/icons/glyphs/calendar-check";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconContact } from "@/ui/icons/glyphs/contact";
import { IconDoor } from "@/ui/icons/glyphs/door";
import { IconElectric } from "@/ui/icons/glyphs/electric";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconKey } from "@/ui/icons/glyphs/key";
import { IconLease } from "@/ui/icons/glyphs/lease";
import { IconParcel } from "@/ui/icons/glyphs/parcel";
import { IconPayment } from "@/ui/icons/glyphs/payment";
import { IconRefresh } from "@/ui/icons/glyphs/refresh";
import { IconRules } from "@/ui/icons/glyphs/rules";
import { IconRoom } from "@/ui/icons/glyphs/room";
import { IconTicket } from "@/ui/icons/glyphs/ticket";

const TILES: { key: string; href: string; icon: IconGlyph; needs: ResidentEntitlement }[] = [
  { key: "bills", href: "/invoices", icon: IconBill, needs: "bills" },
  { key: "receipts", href: "/receipts", icon: IconPayment, needs: "bills" },
  { key: "usage", href: "/usage", icon: IconElectric, needs: "usage" },
  { key: "serviceRequest", href: "/requests", icon: IconTicket, needs: "service_requests" },
  { key: "lease", href: "/lease", icon: IconLease, needs: "lease" },
  { key: "announcements", href: "/announcements", icon: IconAnnounce, needs: "announcements" },
  { key: "parcels", href: "/parcels", icon: IconParcel, needs: "parcels" },
  // `facilities`: the community module with a bookable facility; `access`: smart access with a lock on my unit
  // (D-218). House rules and contacts follow the lease (D-071, D-073).
  { key: "facilities", href: "/facilities", icon: IconCalendarCheck, needs: "facilities" },
  { key: "access", href: "/access", icon: IconDoor, needs: "access" },
  { key: "rules", href: "/rules", icon: IconRules, needs: "lease" },
  { key: "contacts", href: "/contacts", icon: IconContact, needs: "lease" },
];

/**
 * D-226: the resident signed in with an SMS code and their phone matches parties the office entered — nothing is
 * linked until the landlord's Owner confirms who signed in, so there are no bills, lease or door codes yet. "Check
 * again" reloads the page: once confirmed, `/me` lists the unit and the resident layout rotates the session for its
 * scopes (`/auth/rescope`). An invitation code links at once (D-175). Server-rendered, no client JS.
 */
async function LinkPending({ count }: { count: number }) {
  const t = await getTranslations("resident.home");
  return (
    <Card
      as="section"
      aria-labelledby="link-pending-title"
      padding="lg"
      className="bg-primary-subtle border-transparent"
      data-testid="home-link-pending"
    >
      <h2 id="link-pending-title" className="text-primary-subtle-fg flex items-center gap-2 font-semibold">
        <Icon icon={IconClock} />
        {t("linkPending.title")}
      </h2>
      <p className="mt-2 text-sm">{t("linkPending.body", { count })}</p>
      <p className="text-muted mt-2 text-sm">{t("linkPending.hidden")}</p>
      <div className="mt-4 flex flex-col gap-2">
        <Button asChild block iconStart={IconRefresh}>
          {/* A full document load on purpose (not a client navigation): the layout re-reads /me and, once the link
              is confirmed, redirects through the /auth/rescope route handler that rotates the session cookies. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- see above */}
          <a href="/" data-testid="home-link-pending-check">
            {t("linkPending.check")}
          </a>
        </Button>
        <p className="text-muted mt-2 text-sm">{t("linkPending.invite")}</p>
        <Button asChild block variant="secondary" iconStart={IconKey}>
          <Link href="/link">{t("noUnit.cta")}</Link>
        </Button>
      </div>
    </Card>
  );
}

/** The selected unit's invoices: by `unitId`; an invoice without one (a final bill of an ended lease) by unit no. + landlord. */
function ofUnit(invoices: InvoiceView[], unit: ResidentUnit): InvoiceView[] {
  return invoices.filter((invoice) =>
    invoice.unitId
      ? invoice.unitId === unit.unitId
      : invoice.unitNo === unit.unitNo && invoice.issuerName === unit.tenantName,
  );
}

/**
 * Resident home (design-system.md §4 "Mobile hero + tiles", L2 2.1 §1), driven by `/v1/resident/me` and my open
 * invoices: the selected unit (unit no., building, the operator that runs it, since when, its lease), the open
 * invoice of that unit as the hero — amount, due date in words (amber only when attention is needed, never red,
 * D-100) and "scan to pay" straight into the QR sheet — the tiles the resident is entitled to, and the latest
 * notifications. Nothing here is sample data and nothing is computed: amounts are the API's strings.
 */
export async function ResidentHome({
  me,
  unit,
  entitlements,
  openInvoices,
  notifications,
  today,
  vapidKey,
}: {
  me: ResidentMe;
  unit: ResidentUnit | null;
  entitlements: ResidentNavEntitlements;
  /** `null` when the invoices could not be loaded (the hero then links to the list instead). */
  openInvoices: InvoiceView[] | null;
  notifications: InboxItem[];
  today: string;
  vapidKey?: string;
}) {
  const t = await getTranslations("resident.home");
  const root = await getTranslations();
  const current = await getLocale();
  const locale = isLocale(current) ? current : "th";
  // A lease the office sent for signature (D-062) — also before the resident occupies any unit.
  const pending = me.leases.find((lease) => lease.status === "pending_signature");
  const unitLease = unit
    ? me.leases.find(
        (lease) =>
          lease.unitNo === unit.unitNo && lease.tenantId === unit.tenantId && lease.status !== "pending_signature",
      )
    : undefined;
  const due = unit && openInvoices ? openFirst(ofUnit(openInvoices, unit)).open : [];
  const hero = due[0];
  const heroState = hero ? dueState(hero, today) : null;

  return (
    <div className="flex flex-col gap-4 py-5" data-testid="resident-home">
      <h1 className="font-display text-2xl font-semibold">{t("greeting", { name: me.user.displayName })}</h1>

      {pending ? (
        <Card
          as="section"
          aria-labelledby="pending-lease-title"
          padding="lg"
          className="bg-primary-subtle border-transparent"
          data-testid="home-pending-lease"
        >
          <h2 id="pending-lease-title" className="text-primary-subtle-fg font-semibold">
            {t("lease.signTitle")}
          </h2>
          <p className="text-muted mt-1 text-sm">
            {t("lease.signBody", { unit: pending.unitNo, building: pending.buildingName })}
          </p>
          <div className="mt-4">
            <Button asChild block iconStart={IconLease} iconEnd={IconForward}>
              <Link href={`/lease/${pending.leaseId}`}>{t("lease.signCta")}</Link>
            </Button>
          </div>
        </Card>
      ) : null}

      {unit ? (
        <>
          {me.linkRequestsPending > 0 ? (
            <div data-testid="home-link-pending-more">
              <Callout tone="info" icon={IconClock} className="text-sm">
                {t("linkPending.more", { count: me.linkRequestsPending })}
              </Callout>
            </div>
          ) : null}
          {entitlements.has("bills") ? (
            hero && heroState ? (
              <Card
                as="section"
                aria-labelledby="bills-title"
                padding="lg"
                className="bg-primary-subtle border-transparent"
                data-testid="home-invoice"
                data-invoice={hero.id}
              >
                <h2 id="bills-title" className="text-primary-subtle-fg font-semibold">
                  {t("invoice.title", { period: formatDate(hero.periodStart, locale, { style: "month" }) })}
                </h2>
                <MoneyDisplay
                  amount={hero.balance}
                  locale={locale}
                  size="hero"
                  tone={needsAttention(heroState) ? "attention" : "default"}
                />
                <Due state={heroState} dueDate={hero.dueDate} locale={locale} className="mt-1" />
                <div className="mt-4 flex flex-col gap-2">
                  <PayLauncher invoice={hero} label={t("invoice.pay")} testId="home-pay" vapidKey={vapidKey} />
                  <Button asChild variant="ghost" block iconEnd={IconForward}>
                    <Link href={`/invoices/${hero.id}`}>{t("invoice.details")}</Link>
                  </Button>
                  {due.length > 1 ? (
                    <Link href="/invoices" className="text-primary min-h-12 self-center py-3 text-sm font-medium">
                      {t("invoice.more", { count: due.length - 1 })}
                    </Link>
                  ) : null}
                </div>
              </Card>
            ) : (
              <Card as="section" aria-labelledby="bills-title" padding="md" data-testid="home-no-invoice">
                <h2 id="bills-title" className="flex items-center gap-2 font-semibold">
                  {openInvoices ? <Icon icon={IconCheckCircle} className="text-success-subtle-fg" /> : null}
                  {openInvoices ? t("invoice.nothingDue") : t("bills.title")}
                </h2>
                <p className="text-muted mt-1 text-sm">
                  {openInvoices ? t("invoice.nothingDueBody") : t("bills.body")}
                </p>
                <div className="mt-3">
                  <Button asChild block variant="secondary" iconEnd={IconForward}>
                    <Link href="/invoices">{t("bills.cta")}</Link>
                  </Button>
                </div>
              </Card>
            )
          ) : null}

          <Card as="section" aria-labelledby="unit-title" padding="md" data-testid="unit-card">
            <h2 id="unit-title" className="text-muted text-sm">
              {t("unit.title")}
            </h2>
            <p className="mt-1 text-lg font-semibold">{t("unit.unitCode", { code: unit.unitNo })}</p>
            <p className="text-muted text-sm">{t("unit.building", { name: unit.buildingName })}</p>
            <p className="text-muted text-sm">{t("unit.operator", { name: unit.tenantName })}</p>
            <p className="text-muted mt-1 text-xs">{t("unit.since", { date: formatDate(unit.validFrom, locale) })}</p>
            {unitLease ? (
              <Link
                href={`/lease/${unitLease.leaseId}`}
                className="text-primary mt-1 inline-flex min-h-12 items-center gap-1 text-sm font-medium"
                data-testid="unit-lease"
              >
                {t("unit.lease", {
                  number: unitLease.number ?? "—",
                  status: root(LEASE_STATUS[unitLease.status].labelKey),
                })}
              </Link>
            ) : null}
          </Card>

          <section aria-labelledby="tiles-title">
            <h2 id="tiles-title" className="sr-only">
              {t("tiles.title")}
            </h2>
            <ul className="grid grid-cols-3 gap-3">
              {TILES.filter((tile) => entitlements.has(tile.needs)).map((tile) => (
                <li key={tile.key}>
                  <Link
                    href={tile.href}
                    className="rounded-card border-border bg-surface shadow-card flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 border p-2 text-center text-sm font-medium [overflow-wrap:anywhere]"
                  >
                    <span className="text-primary text-2xl">
                      <Icon icon={tile.icon} />
                    </span>
                    {t(`tiles.${tile.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {notifications.length ? (
            <section aria-labelledby="inbox-title" data-testid="home-notifications">
              <h2 id="inbox-title" className="mb-1 flex items-center gap-2 font-semibold">
                <Icon icon={IconBell} />
                {t("inbox.title")}
              </h2>
              <ul>
                {notifications.map((item) => (
                  <li key={item.id} className="border-border border-b py-2 last:border-b-0">
                    <p className="flex items-start justify-between gap-2">
                      <span className={item.readAt ? "font-medium" : "font-semibold"}>
                        {item.readAt ? null : <span className="sr-only">{t("inbox.unread")} </span>}
                        {item.title ?? item.body}
                      </span>
                      <time dateTime={item.createdAt} className="text-muted shrink-0 text-xs">
                        {formatRelativeTime(item.createdAt, locale)}
                      </time>
                    </p>
                    {item.title ? <p className="text-muted text-sm">{item.body}</p> : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : me.linkRequestsPending > 0 ? (
        <LinkPending count={me.linkRequestsPending} />
      ) : pending ? null : (
        <EmptyState
          icon={IconRoom}
          title={t("noUnit.title")}
          description={t("noUnit.body")}
          action={
            <Button asChild iconStart={IconKey}>
              <Link href="/link">{t("noUnit.cta")}</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
