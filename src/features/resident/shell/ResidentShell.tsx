import { getLocale, getTranslations } from "next-intl/server";

import { isLocale } from "@/i18n/routing";
import type { ResidentEntitlement } from "@/lib/api/types";
import { getActor } from "@/lib/auth/actor";
import { clientEnv } from "@/lib/env";
import type { NavItem } from "@/ui/components/AppShell";
import { Icon, type IconName } from "@/ui/icons";

import { ResidentShellView } from "./ResidentShellView";
import { SettingsMenu } from "./SettingsMenu";
import { UnitSwitcher } from "./UnitSwitcher";

export type ResidentNavKey = "home" | "bills" | "usage" | "requests" | "me";

/**
 * Bottom nav entries and the entitlement each needs (`/v1/resident/me`; CONTRACT-REQUEST #2 until the contract
 * lists entitlements). Home and Me are always there; Repairs is R2.
 */
export const RESIDENT_NAV: { key: ResidentNavKey; href: string; icon: IconName; needs?: ResidentEntitlement }[] = [
  { key: "home", href: "/", icon: "home" },
  { key: "bills", href: "/bills", icon: "bill", needs: "bills" },
  { key: "usage", href: "/usage", icon: "electric", needs: "usage" },
  { key: "requests", href: "/requests", icon: "ticket", needs: "service_requests" },
  { key: "me", href: "/profile", icon: "resident" },
];

/**
 * The resident app frame, from `/v1/resident/me`: unit code + building name in the header (with the switcher
 * for several occupancies), settings, and the bottom nav from the entitlements. `chrome="minimal"` (sign-in,
 * consent, linking, errors) keeps only the wordmark and settings.
 */
export async function ResidentShell({
  active,
  chrome = "full",
  children,
}: {
  active: ResidentNavKey | null;
  chrome?: "full" | "minimal";
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

  const items: NavItem[] = full
    ? RESIDENT_NAV.filter((item) => !item.needs || actor.entitlements.has(item.needs)).map((item) => ({
        href: item.href,
        label: nav(item.key),
        icon: <Icon name={item.icon} />,
        active: item.key === active,
      }))
    : [];

  const badge = clientEnv().NEXT_PUBLIC_ENV_BADGE;

  return (
    <ResidentShellView
      skipLabel={t("skipToContent")}
      navLabel={t("bottomNav")}
      navItems={items}
      envBadge={badge ? t("envBadge", { name: badge }) : undefined}
      unit={
        signedIn && actor.unit && chrome === "full" ? (
          <UnitSwitcher
            currentId={actor.unit.unitId}
            units={actor.me.units.map(({ unitId, unitNo, buildingName, tenantName }) => ({
              unitId,
              unitNo,
              buildingName,
              tenantName,
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
