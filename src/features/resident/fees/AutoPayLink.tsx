"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { Icon } from "@/ui/icons";
import { IconRepeat } from "@/ui/icons/glyphs/repeat";

import { recurringOffUnits } from "./recurring";

const subscribe = () => () => undefined;

/**
 * "Set up yearly auto-pay" as a quiet text link with the repeat icon (J-DESIGN §3: not a sparkle) — hidden on a device
 * where the API already said the channel is not offered for this unit (contract request #44).
 */
export function AutoPayLink({ unitId, label, meta }: { unitId: string; label: string; meta?: string }) {
  // Device storage, read after hydration (the server renders the link; a hidden one is the rare case).
  const hidden = useSyncExternalStore(
    subscribe,
    () => recurringOffUnits().includes(unitId),
    () => false,
  );
  if (hidden) return null;
  return (
    <Link
      href={`/units/${unitId}/auto-pay`}
      className="text-primary mx-auto inline-flex min-h-11 items-center gap-1.5 px-2 text-sm font-medium"
      data-testid="fees-autopay"
    >
      <Icon icon={IconRepeat} />
      <span>{label}</span>
      {meta ? <span className="text-muted font-normal">· {meta}</span> : null}
    </Link>
  );
}
