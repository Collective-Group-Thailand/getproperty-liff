import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { formatDate } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import type { ResidentEntitlement, ResidentMe, ResidentUnit } from "@/lib/api/types";
import type { ResidentNavEntitlements } from "@/lib/auth/entitlements";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { Icon, type IconGlyph } from "@/ui/icons";
import { IconAnnounce } from "@/ui/icons/glyphs/announce";
import { IconBill } from "@/ui/icons/glyphs/bill";
import { IconElectric } from "@/ui/icons/glyphs/electric";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconKey } from "@/ui/icons/glyphs/key";
import { IconLease } from "@/ui/icons/glyphs/lease";
import { IconParcel } from "@/ui/icons/glyphs/parcel";
import { IconRoom } from "@/ui/icons/glyphs/room";
import { IconTicket } from "@/ui/icons/glyphs/ticket";

const TILES: { key: string; href: string; icon: IconGlyph; needs: ResidentEntitlement }[] = [
  { key: "bills", href: "/bills", icon: IconBill, needs: "bills" },
  { key: "usage", href: "/usage", icon: IconElectric, needs: "usage" },
  { key: "serviceRequest", href: "/requests", icon: IconTicket, needs: "service_requests" },
  { key: "lease", href: "/lease", icon: IconLease, needs: "lease" },
  { key: "announcements", href: "/announcements", icon: IconAnnounce, needs: "announcements" },
  { key: "parcels", href: "/parcels", icon: IconParcel, needs: "parcels" },
];

/**
 * Resident home (design-system.md §4 "Mobile hero + tiles"), driven by `/v1/resident/me`: the greeting, the
 * selected unit (unit no., building, the operator that runs it, since when), the bills card and the tiles the
 * resident is entitled to. The open-invoice hero with the amount and the QR arrives with the invoice endpoints
 * (L2); nothing here is sample data.
 */
export async function ResidentHome({
  me,
  unit,
  entitlements,
}: {
  me: ResidentMe;
  unit: ResidentUnit | null;
  entitlements: ResidentNavEntitlements;
}) {
  const t = await getTranslations("resident.home");
  const current = await getLocale();
  const locale = isLocale(current) ? current : "th";
  // A lease the office sent for signature (D-062) — also before the resident occupies any unit.
  const pending = me.leases.find((lease) => lease.status === "pending_signature");

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
          <Card as="section" aria-labelledby="unit-title" padding="md" data-testid="unit-card">
            <h2 id="unit-title" className="text-muted text-sm">
              {t("unit.title")}
            </h2>
            <p className="mt-1 text-lg font-semibold">{t("unit.unitCode", { code: unit.unitNo })}</p>
            <p className="text-muted text-sm">{t("unit.building", { name: unit.buildingName })}</p>
            <p className="text-muted text-sm">{t("unit.operator", { name: unit.tenantName })}</p>
            <p className="text-muted mt-1 text-xs">{t("unit.since", { date: formatDate(unit.validFrom, locale) })}</p>
          </Card>

          {entitlements.has("bills") ? (
            <Card
              as="section"
              aria-labelledby="bills-title"
              padding="lg"
              className="bg-primary-subtle border-transparent"
            >
              <h2 id="bills-title" className="text-primary-subtle-fg font-semibold">
                {t("bills.title")}
              </h2>
              <p className="text-muted mt-1 text-sm">{t("bills.body")}</p>
              <div className="mt-4">
                <Button asChild block variant="secondary" iconEnd={IconForward}>
                  <Link href="/bills">{t("bills.cta")}</Link>
                </Button>
              </div>
            </Card>
          ) : null}

          <section aria-labelledby="tiles-title">
            <h2 id="tiles-title" className="sr-only">
              {t("tiles.title")}
            </h2>
            <ul className="grid grid-cols-3 gap-3">
              {TILES.filter((tile) => entitlements.has(tile.needs)).map((tile) => (
                <li key={tile.key}>
                  <Link
                    href={tile.href}
                    className="rounded-card border-border bg-surface shadow-card flex min-h-24 flex-col items-center justify-center gap-2 border p-2 text-center text-sm font-medium"
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
        </>
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
