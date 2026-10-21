import { Mark, Wordmark } from "@/ui/brand";
import { AppShell, BottomNav, TopBar, type NavItem } from "@/ui/components/AppShell";
import { Badge } from "@/ui/components/Badge";

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
  children,
}: ResidentShellViewProps) {
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
      }
      bottomNav={navItems.length > 0 ? <BottomNav items={navItems} label={navLabel} /> : undefined}
    >
      {brand === "hero" && !unit ? (
        <div className="flex justify-center pt-8 pb-2" data-testid="brand-hero">
          <Wordmark size="md" />
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}
