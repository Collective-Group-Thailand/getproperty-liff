"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { recallUnit, rememberUnit, unitToRestore, writeUnitCookie } from "@/features/resident/units/choice";

import { UnitSwitcherView, type UnitSwitcherViewProps } from "./UnitSwitcherView";

export type { SwitcherUnit } from "./UnitSwitcherView";

/**
 * The switcher wired to the app (JRL): remembers the choice (cookie for the server, storage as a back-up), refreshes
 * the session first when `/me/units` said the token is behind (`refreshRequired`), and re-renders the server
 * components for that unit. A render without the cookie puts a stored choice back.
 */
export function UnitSwitcher({
  refreshRequired = false,
  remembered = true,
  ...props
}: Omit<UnitSwitcherViewProps, "onSelect"> & { refreshRequired?: boolean; remembered?: boolean }) {
  const router = useRouter();
  const ids = props.units.map((u) => u.unitId).join(",");

  useEffect(() => {
    if (remembered) return;
    const restore = unitToRestore(recallUnit(), ids.split(","), props.currentId);
    if (!restore) return;
    writeUnitCookie(restore);
    router.refresh();
  }, [remembered, ids, props.currentId, router]);

  return (
    <UnitSwitcherView
      {...props}
      onSelect={async (unitId) => {
        rememberUnit(unitId);
        // Best effort: when it fails the resident layout rotates the session on the next render (/auth/rescope). A plain
        // fetch on purpose — the switcher is on every page, the typed client is not (D-179).
        if (refreshRequired) {
          await fetch("/bff/auth/refresh", {
            method: "POST",
            credentials: "same-origin",
            headers: { "x-getproperty-csrf": "1", "content-type": "application/json" },
          }).catch(() => undefined);
        }
        router.refresh();
      }}
    />
  );
}
