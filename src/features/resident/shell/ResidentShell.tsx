import { getLocale, getTranslations } from "next-intl/server";

import { isLocale } from "@/i18n/routing";
import type { ResidentEntitlement } from "@/lib/api/types";
import { getActor } from "@/lib/auth/actor";
import { kindWords } from "@/features/resident/fees/model";
import { gateUnit } from "@/features/resident/visitors/model";
import { homeKindOf, primaryRole } from "@/lib/auth/units";
import { serverEnv } from "@/lib/env";
import type { NavItem } from "@/ui/components/AppShell";
import { Icon, type IconGlyph } from "@/ui/icons";
import { IconBill } from "@/ui/icons/glyphs/bill";
import { IconElectric } from "@/ui/icons/glyphs/electric";
import { IconHome } from "@/ui/icons/glyphs/home";
import { IconResident } from "@/ui/icons/glyphs/resident";
import { IconShield } from "@/ui/icons/glyphs/shield";
import { IconTicket } from "@/ui/icons/glyphs/ticket";

import { ResidentShellView } from "./ResidentShellView";
import { SettingsMenu } from "./SettingsMenu";
import { UnitSwitcher } from "./UnitSwitcher";

export type ResidentNavKey = "home" | "bills" | "visitors" | "usage" | "requests" | "me";

/**
 * Bottom nav entries and the entitlement each needs (`ResidentMeDto.entitlements`, D-063) — for the unit on screen
 * (JRL: `actor.entitlements` is already narrowed by its capabilities, D-322). Home and Me are always there.
 */
export const RESIDENT_NAV: {
  key: ResidentNavKey;
  href: string;
  icon: IconGlyph;
  needs?: ResidentEntitlement | "gate";
}[] = [
  { key: "home", href: "/", icon: IconHome },
  { key: "bills", href: "/invoices", icon: IconBill, needs: "bills" },
  // JL4: the unit on screen has the API's `gate` capability (CR #49, D-335).
  { key: "visitors", href: "/visitors", icon: IconShield, needs: "gate" },
  { key: "usage", href: "/usage", icon: IconElectric, needs: "usage" },
  { key: "requests", href: "/requests", icon: IconTicket, needs: "service_requests" },
  { key: "me", href: "/profile", icon: IconResident },
];

/**
 * The bottom nav for the unit on screen: five items at most (360 px). Visitors sit third (J-DESIGN §3 Stitch); when a
 * gate unit also has usage, usage leaves the bar for a home tile — a household checks the gate daily, the meters
 * monthly.
 */
export function residentNav(entitlements: ReadonlySet<ResidentEntitlement>, gate: boolean) {
  const shown = RESIDENT_NAV.filter((item) =>
    !item.needs ? true : item.needs === "gate" ? gate : entitlements.has(item.needs),
  );
  return shown.length > 5 ? shown.filter((item) => item.key !== "usage") : shown;
}

/** True when `residentNav` left usage out of the bar (home then shows it as a tile). */
export function usageOffNav(entitlements: ReadonlySet<ResidentEntitlement>, gate: boolean): boolean {
  return entitlements.has("usage") && !residentNav(entitlements, gate).some((item) => item.key === "usage");
}

/**
 * The resident app frame, from `/v1/resident/me`: unit code + building name in the header (with the switcher
 * for several occupancies), settings, and the bottom nav from the entitlements. `chrome="minimal"` (errors) keeps
 * only the logo and settings; `chrome="entry"` (sign-in, the SMS code, the LINE entry, consent, linking, signed out)
 * shows the full logo above the content instead of in the top bar.
 */
export async function ResidentShell({
  active,
  chrome = "full",
  back,
  children,
}: {
  active: ResidentNavKey | null;
  chrome?: "full" | "minimal" | "entry";
  /**
   * A record or form screen (an invoice, a request, the lease, a form): "‹ {label}" in the top bar with the unit at its
   * end, and no bottom nav — the screen's one action docks on the bottom edge instead (redesign G2 r2).
   */
  back?: { href: string; label: string };
  children: React.ReactNode;
}) {
  const [t, nav, actor, current] = await Promise.all([
    getTranslations("shell"),
    getTranslations("resident.nav"),
    getActor(),
    getLocale(),
  ]);
  const locale = isLocale(current) ? current : "th";
  const signedIn = actor.status === "signed-in";
  const full = chrome === "full" && signedIn && actor.unit !== null;

  // JL1: a co-owner's bills are the common fees — the bills tab opens `/fees` on a unit whose home is the owner's.
  const ownerHome = actor.status === "signed-in" && homeKindOf(actor.unit) === "owner";
  const items: NavItem[] = full
    ? residentNav(actor.entitlements, gateUnit(actor.unit)).map((item) => ({
        href: item.key === "bills" && ownerHome ? "/fees" : item.href,
        label: nav(item.key),
        icon: <Icon icon={item.icon} />,
        active: item.key === active,
      }))
    : [];

  // Read at run time (the same image runs in UAT and production, D-230).
  const badge = serverEnv().NEXT_PUBLIC_ENV_BADGE;

  return (
    <ResidentShellView
      skipLabel={t("skipToContent")}
      navLabel={t("bottomNav")}
      navItems={items}
      envBadge={badge ? t("envBadge", { name: badge }) : undefined}
      brand={chrome === "entry" ? "hero" : "header"}
      back={
        back
          ? {
              ...back,
              context:
                signedIn && actor.unit
                  ? t("unitSwitcher.unit", { unit: actor.unit.unitNo, kind: kindWords(actor.unit.propertyKind).unit })
                  : undefined,
            }
          : undefined
      }
      unit={
        signedIn && actor.unit && chrome === "full" ? (
          <UnitSwitcher
            currentId={actor.unit.unitId}
            refreshRequired={actor.refreshRequired}
            remembered={actor.remembered}
            units={actor.units.map((unit) => ({
              unitId: unit.unitId,
              unitNo: unit.unitNo,
              kind: kindWords(unit.propertyKind).unit,
              buildingName: unit.buildingName,
              tenantName: unit.tenantName,
              role: primaryRole(unit),
            }))}
          />
        ) : undefined
      }
      settings={<SettingsMenu locale={locale} signedIn={signedIn} />}
    >
      {children}
    </ResidentShellView>
  );
}
