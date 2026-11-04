import Link from "next/link";

import { Mark, Wordmark } from "@/ui/brand";
import { AppShell, BottomNav, TopBar, type NavItem } from "@/ui/components/AppShell";
import { Badge } from "@/ui/components/Badge";
import { Icon } from "@/ui/icons";
import { IconBack } from "@/ui/icons/glyphs/back";

/**
 * Where the founder's logo sits (docs/ui/brand.md):
 * - `header` — the full logo in the top bar (screens without a unit: errors, the technician app);
 * - `hero` — the full logo above the content and none in the top bar (sign-in, the SMS code, consent, the LINE
 *   entry, signed out: the first thing a resident sees is the brand, once);
 * - with a `unit`, the house alone sits before the unit switcher (decorative: the page title names the app).
 */
export type ShellBrandPlacement = "header" | "hero";

export interface ResidentShellViewProps {
  skipLabel: string;
  navLabel: string;
  /** Empty = no bottom nav (signed out, consent, linking, the technician shell). */
  navItems: NavItem[];
  /** The unit switcher when signed in with a unit; the logo otherwise. */
  unit?: React.ReactNode;
  settings: React.ReactNode;
  envBadge?: string;
  brand?: ShellBrandPlacement;
  /**
   * Record and form screens (redesign G2 r2): the top bar becomes "‹ {label}" and the bottom nav goes away, so the
   * screen's one action can dock on the bottom edge. `context` sits at the end of the bar (the unit, muted).
   */
  back?: { href: string; label: string; context?: React.ReactNode };
  children: React.ReactNode;
}

/**
 * The resident frame (design-system.md §5 "Resident app"): a phone-width column, a top bar with the unit and
 * building (or the logo), the settings sheet, and the bottom nav built from the resident's entitlements.
 * Presentational only — `ResidentShell` loads the data; Storybook snapshots this.
 *
 * A server component: the logo's path data is markup in the RSC payload, never client JavaScript (D-179). It must
 * not be imported by a client component (`brand-boundary.test.ts`); client parts (the unit switcher, settings)
 * come in as props.
 */
export function ResidentShellView({
  skipLabel,
  navLabel,
  navItems,
  unit,
  settings,
  envBadge,
  brand = "header",
  back,
  children,
}: ResidentShellViewProps) {
  const nav = back ? [] : navItems;
  const leading = unit ? (
    <>
      <Mark size="sm" decorative />
      {unit}
    </>
  ) : brand === "header" ? (
    <Wordmark size="sm" />
  ) : null;
  return (
    <AppShell
      variant="mobile"
      skipLabel={skipLabel}
      header={
        back ? (
          <TopBar className="gap-1 ps-1">
            <Link
              href={back.href}
              className="hover:bg-bg-subtle rounded-control flex min-h-12 min-w-0 flex-1 items-center gap-2 px-3 font-semibold"
              data-testid="back-link"
            >
              <Icon icon={IconBack} className="shrink-0 text-xl rtl:rotate-180" />
              <span className="truncate">{back.label}</span>
            </Link>
            {envBadge ? (
              <Badge tone="warning" size="sm">
                {envBadge}
              </Badge>
            ) : null}
            {back.context ? (
              <span className="text-muted shrink-0 truncate pe-3 text-sm" data-testid="shell-context">
                {back.context}
              </span>
            ) : null}
          </TopBar>
        ) : (
          <TopBar className="gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2" data-testid="shell-leading">
              {leading}
            </div>
            {envBadge ? (
              <Badge tone="warning" size="sm">
                {envBadge}
              </Badge>
            ) : null}
            {settings}
          </TopBar>
        )
      }
      bottomNav={nav.length > 0 ? <BottomNav items={nav} label={navLabel} /> : undefined}
    >
      {/* `--dock` / `--dock-pad`: where a screen's docked primary action (`ActionDock`) rests — on the bottom nav
          when there is one, else on the bottom edge clear of the home indicator. */}
      <div
        className={
          nav.length > 0
            ? "flex min-h-[calc(100dvh-3.5rem-var(--bottom-nav-h))] flex-col [--dock-pad:0px] [--dock:var(--bottom-nav-h)]"
            : back
              ? "flex min-h-[calc(100dvh-3.5rem)] flex-col pt-3"
              : "flex min-h-[calc(100dvh-3.5rem)] flex-col"
        }
      >
        {brand === "hero" && !unit ? (
          <div className="flex justify-center pt-10 pb-4" data-testid="brand-hero">
            <Wordmark size="md" />
          </div>
        ) : null}
        {children}
      </div>
    </AppShell>
  );
}
