"use client";

import { useTranslations } from "next-intl";
import { lazy, Suspense, useState } from "react";

import type { ResidentUnitRole } from "@/lib/api/types";
import { Icon } from "@/ui/icons";
import { IconChevronsUpDown } from "@/ui/icons/glyphs/chevrons-up-down";

const UnitSheet = lazy(() => import("./UnitSheet"));

export interface SwitcherUnit {
  unitId: string;
  unitNo: string;
  buildingName: string;
  tenantName: string;
  /** JRL: the role word of the row (co-owner, tenant, co-tenant, payer, family); `null` says nothing. */
  role?: ResidentUnitRole | null;
}

export interface UnitSwitcherViewProps {
  units: SwitcherUnit[];
  currentId: string;
  onSelect: (unitId: string) => void | Promise<void>;
}

/**
 * The header's unit + building (`/v1/resident/me/units`). A resident with several units — rooms they rent, condos they
 * co-own, a family home (D-061, D-309) — taps it to switch in a bottom sheet ("all my units (n)", a role word per
 * row); with one unit it is plain text. The bar keeps the unit on screen, never "all units": every screen below is
 * about one unit (JRL design decision).
 */
export function UnitSwitcherView({ units, currentId, onSelect }: UnitSwitcherViewProps) {
  const t = useTranslations("shell.unitSwitcher");
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const current = units.find((u) => u.unitId === currentId) ?? units[0];
  if (!current) return null;

  const label = (
    <span className="flex min-w-0 flex-col items-start leading-tight">
      <span className="truncate text-base font-semibold" data-testid="header-unit">
        {t("unit", { unit: current.unitNo })}
      </span>
      <span className="text-muted truncate text-xs" data-testid="header-building">
        {current.buildingName}
      </span>
    </span>
  );

  if (units.length < 2) return <div className="min-w-0">{label}</div>;

  return (
    <>
      <button
        type="button"
        className="rounded-control hover:bg-bg-subtle -ms-2 flex min-h-12 min-w-0 items-center gap-1 px-2 text-start"
        aria-haspopup="dialog"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        data-testid="unit-switcher"
      >
        {label}
        {/* The visible unit and building are the name; the action is appended for screen readers (WCAG 2.5.3). */}
        <span className="sr-only">{t("switch")}</span>
        <Icon icon={IconChevronsUpDown} className="text-muted shrink-0" />
      </button>
      {loaded ? (
        <Suspense fallback={null}>
          <UnitSheet open={open} setOpen={setOpen} units={units} current={current} onSelect={onSelect} />
        </Suspense>
      ) : null}
    </>
  );
}
