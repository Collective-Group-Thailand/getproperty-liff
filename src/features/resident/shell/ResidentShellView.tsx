import { Wordmark } from "@/ui/brand";
import { AppShell, BottomNav, TopBar, type NavItem } from "@/ui/components/AppShell";
import { Badge } from "@/ui/components/Badge";

export interface ResidentShellViewProps {
  skipLabel: string;
  navLabel: string;
  /** Empty = no bottom nav (signed out, consent, linking, the technician shell). */
  navItems: NavItem[];
  /** The unit switcher when signed in with a unit; the wordmark otherwise. */
  unit?: React.ReactNode;
  settings: React.ReactNode;
  envBadge?: string;
  children: React.ReactNode;
}

/**
 * The resident frame (design-system.md §5 "Resident app"): a phone-width column, a top bar with the unit and
 * building (or the wordmark), the settings sheet, and the bottom nav built from the resident's entitlements.
 * Presentational only — `ResidentShell` loads the data; Storybook snapshots this.
 */
export function ResidentShellView({
  skipLabel,
  navLabel,
  navItems,
  unit,
  settings,
  envBadge,
  children,
}: ResidentShellViewProps) {
  return (
    <AppShell
      variant="mobile"
      skipLabel={skipLabel}
      header={
        <TopBar className="gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">{unit ?? <Wordmark size="sm" />}</div>
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
      {children}
    </AppShell>
  );
}
