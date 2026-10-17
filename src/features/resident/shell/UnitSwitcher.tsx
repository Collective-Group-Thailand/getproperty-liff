"use client";

import { useRouter } from "next/navigation";

import { UNIT_COOKIE } from "@/lib/auth/cookies";

import { UnitSwitcherView, type UnitSwitcherViewProps } from "./UnitSwitcherView";

export type { SwitcherUnit } from "./UnitSwitcherView";

/** The switcher wired to the app: remembers the choice and re-renders the server components for that unit. */
export function UnitSwitcher(props: Omit<UnitSwitcherViewProps, "onSelect">) {
  const router = useRouter();
  return (
    <UnitSwitcherView
      {...props}
      onSelect={(unitId) => {
        const secure = window.location.protocol === "https:" ? "; secure" : "";
        document.cookie = `${UNIT_COOKIE}=${unitId}; path=/; max-age=31536000; samesite=lax${secure}`;
        router.refresh();
      }}
    />
  );
}
