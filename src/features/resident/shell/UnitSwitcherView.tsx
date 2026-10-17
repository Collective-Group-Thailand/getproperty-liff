"use client";

import { useTranslations } from "next-intl";
import { lazy, Suspense, useState } from "react";

import { Icon } from "@/ui/icons";

const UnitSheet = lazy(() => import("./UnitSheet"));

export interface SwitcherUnit {
  unitId: string;
  unitNo: string;
  buildingName: string;
  tenantName: string;
}

export interface UnitSwitcherViewProps {
  units: SwitcherUnit[];
  currentId: string;
  onSelect: (unitId: string) => void;
}

/**
 * The header's unit + building (from `/v1/resident/me`). A resident with several occupancies (D-061: families,
 * companies, more than one room) taps it to switch in a bottom sheet; with one unit it is plain text.
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
        aria-label={t("open", { unit: current.unitNo, building: current.buildingName })}
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        data-testid="unit-switcher"
      >
        {label}
        <Icon name="chevrons-up-down" className="text-muted shrink-0" />
      </button>
      {loaded ? (
        <Suspense fallback={null}>
          <UnitSheet open={open} setOpen={setOpen} units={units} current={current} onSelect={onSelect} />
        </Suspense>
      ) : null}
    </>
  );
}
