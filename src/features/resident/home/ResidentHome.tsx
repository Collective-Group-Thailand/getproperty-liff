import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDate } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { MoneyDisplay } from "@/ui/components/MoneyDisplay";
import { Icon, type IconName } from "@/ui/icons";

import { SAMPLE_HOME } from "./sample";

const TILES: { key: string; href: string; icon: IconName }[] = [
  { key: "bills", href: "/bills", icon: "bill" },
  { key: "usage", href: "/usage", icon: "electric" },
  { key: "serviceRequest", href: "/requests", icon: "ticket" },
  { key: "lease", href: "/lease", icon: "lease" },
  { key: "announcements", href: "/announcements", icon: "announce" },
  { key: "parcels", href: "/parcels", icon: "parcel" },
];

/**
 * Resident home (L0 placeholder, design-system.md §4 "Mobile hero + tiles"): the unit card, the open
 * invoice as the hero ("a bill that is pleasant to pay", D-100) and the quick tiles. Static sample data
 * until L2 wires `/v1/resident/*`; the layout is the real one.
 */
export async function ResidentHome() {
  const t = await getTranslations("resident.home");
  const shell = await getTranslations("shell");
  const current = await getLocale();
  const locale = isLocale(current) ? current : "th";
  const { unit, openInvoice, residentName } = SAMPLE_HOME;

  return (
    <div className="flex flex-col gap-4 py-5" data-testid="resident-home">
      <div className="flex flex-col items-start gap-2">
        <Badge tone="info" size="sm" icon="info">
          {shell("sample")}
        </Badge>
        <h1 className="font-display text-2xl font-semibold">{t("greeting", { name: residentName })}</h1>
      </div>

      <Card as="section" aria-labelledby="unit-title" padding="md">
        <h2 id="unit-title" className="text-muted text-sm">
          {t("unit.title")}
        </h2>
        <p className="mt-1 text-lg font-semibold">{t("unit.unitCode", { code: unit.code })}</p>
        <p className="text-muted text-sm">
          {t("unit.building", { name: unit.building })}
          {" · "}
          {t("unit.leaseUntil", { date: formatDate(unit.leaseEnd, locale) })}
        </p>
      </Card>

      <Card as="section" aria-labelledby="invoice-title" padding="lg" className="bg-primary-subtle border-transparent">
        <h2 id="invoice-title" className="text-primary-subtle-fg text-sm font-medium">
          {t("openInvoice.title")}
        </h2>
        <p className="text-muted mt-1 text-sm">
          {t("openInvoice.period", { period: formatDate(openInvoice.period, locale, { style: "month" }) })}
        </p>
        <p className="mt-2">
          <MoneyDisplay amount={openInvoice.amount} locale={locale} size="hero" />
        </p>
        <p className="text-muted mt-1 text-sm">
          {t("openInvoice.due", { date: formatDate(openInvoice.dueDate, locale) })}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Button asChild size="lg" block iconStart="qr">
            <Link href="/pay">{t("openInvoice.pay")}</Link>
          </Button>
          <Button asChild variant="ghost" block>
            <Link href="/bills">{t("openInvoice.details")}</Link>
          </Button>
        </div>
      </Card>

      <section aria-labelledby="tiles-title">
        <h2 id="tiles-title" className="sr-only">
          {t("tiles.title")}
        </h2>
        <ul className="grid grid-cols-3 gap-3">
          {TILES.map((tile) => (
            <li key={tile.key}>
              <Link
                href={tile.href}
                className="rounded-card border-border bg-surface shadow-card flex min-h-24 flex-col items-center justify-center gap-2 border p-2 text-center text-sm font-medium"
              >
                <span className="text-primary text-2xl">
                  <Icon name={tile.icon} />
                </span>
                {t(`tiles.${tile.key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
