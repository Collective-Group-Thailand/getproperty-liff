import { getTranslations } from "next-intl/server";

import { Wordmark } from "@/ui/brand";
import { AppShell, BottomNav, TopBar, type NavItem } from "@/ui/components/AppShell";
import { Icon, type IconName } from "@/ui/icons";

import { ResidentThemeToggle } from "./ResidentThemeToggle";

export type ResidentNavKey = "home" | "bills" | "usage" | "requests" | "me";

/** The resident bottom nav (L1 builds it from `/v1/resident/me` entitlements; "requests" is R2). */
const NAV: { key: ResidentNavKey; href: string; icon: IconName }[] = [
  { key: "home", href: "/", icon: "home" },
  { key: "bills", href: "/bills", icon: "bill" },
  { key: "usage", href: "/usage", icon: "electric" },
  { key: "requests", href: "/requests", icon: "ticket" },
  { key: "me", href: "/profile", icon: "resident" },
];

/**
 * The resident app frame: a phone-width column (`AppShell variant="mobile"`), a top bar with the
 * wordmark and the theme picker, and the bottom nav. Works inside LIFF and as a standalone mobile page;
 * safe areas come from `data-zone="resident"` (src/ui/styles/zones.css) and the bottom nav's own inset.
 */
export async function ResidentShell({
  active,
  children,
}: {
  active: ResidentNavKey | null;
  children: React.ReactNode;
}) {
  const t = await getTranslations("shell");
  const nav = await getTranslations("resident.nav");
  const items: NavItem[] = NAV.map((item) => ({
    href: item.href,
    label: nav(item.key),
    icon: <Icon name={item.icon} />,
    active: item.key === active,
  }));

  return (
    <AppShell
      variant="mobile"
      skipLabel={t("skipToContent")}
      header={
        <TopBar>
          <Wordmark size="sm" />
          <span className="ms-auto">
            <ResidentThemeToggle />
          </span>
        </TopBar>
      }
      bottomNav={<BottomNav items={items} label={t("bottomNav")} />}
    >
      {children}
    </AppShell>
  );
}
