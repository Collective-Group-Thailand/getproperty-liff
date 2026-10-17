"use client";

import { useTranslations } from "next-intl";

import { Icon } from "@/ui/icons";
import { IconCheck } from "@/ui/icons/glyphs/check";
import { IconRoom } from "@/ui/icons/glyphs/room";
import { cn } from "@/ui/lib/cn";
// eslint-disable-next-line no-restricted-imports -- this module is itself loaded on first open (UnitSwitcherView, D-179)
import { Sheet } from "@/ui/components/Sheet";

import type { SwitcherUnit } from "./UnitSwitcherView";

export interface UnitSheetProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  units: SwitcherUnit[];
  current: SwitcherUnit;
  onSelect: (unitId: string) => void;
}

/** The unit list in a bottom sheet; loaded on first open (`UnitSwitcherView`). */
export default function UnitSheet({ open, setOpen, units, current, onSelect }: UnitSheetProps) {
  const t = useTranslations("shell.unitSwitcher");
  const common = useTranslations("common");
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      title={t("title")}
      description={t("description", { count: units.length })}
      closeLabel={common("close")}
    >
      <ul className="flex flex-col gap-2" role="list">
        {units.map((unit) => {
          const selected = unit.unitId === current.unitId;
          return (
            <li key={unit.unitId}>
              <button
                type="button"
                aria-pressed={selected}
                className={cn(
                  "rounded-card border-border flex min-h-14 w-full items-center gap-3 border px-4 py-3 text-start",
                  selected ? "border-primary bg-primary-subtle text-primary-subtle-fg" : "bg-surface",
                )}
                onClick={() => {
                  setOpen(false);
                  if (!selected) onSelect(unit.unitId);
                }}
              >
                <Icon icon={IconRoom} className="shrink-0 text-xl" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{t("unit", { unit: unit.unitNo })}</span>
                  <span className="text-muted text-sm">
                    {t("place", { building: unit.buildingName, operator: unit.tenantName })}
                  </span>
                </span>
                {selected ? (
                  <span className="flex shrink-0 items-center gap-1 text-sm">
                    <Icon icon={IconCheck} />
                    <span className="sr-only">{t("current")}</span>
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
