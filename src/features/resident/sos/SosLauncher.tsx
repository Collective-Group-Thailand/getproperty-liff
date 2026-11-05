"use client";

import { useState } from "react";

import { Button } from "@/ui/components/Button";
import { IconSiren } from "@/ui/icons/glyphs/siren";
import { lazyOverlay } from "@/ui/lib/lazy";

import type { SosSheetProps } from "./SosSheet";

const SosSheet = lazyOverlay<SosSheetProps>(() => import("./SosSheet").then((module) => module.default));

/**
 * The way into an emergency (J-DESIGN §4): an outlined danger "ฉุกเฉิน" that opens the SOS sheet. The sheet and its
 * hold control load on first use (D-179) — the page itself carries only this button.
 */
export function SosLauncher({
  unitId,
  unitName,
  label,
  variant = "button",
  hint,
}: {
  unitId: string;
  unitName: string;
  label: string;
  /** `row`: home's full-width outlined button with a hint; `button`: the header's small outlined button. */
  variant?: "button" | "row";
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {variant === "row" ? (
        <div className="flex flex-col gap-1">
          <Button
            variant="destructive"
            size="lg"
            block
            iconStart={IconSiren}
            onClick={() => setOpen(true)}
            data-testid="sos-open"
          >
            {label}
          </Button>
          {hint ? <p className="text-muted text-center text-sm">{hint}</p> : null}
        </div>
      ) : (
        <Button
          variant="destructive"
          size="md"
          iconStart={IconSiren}
          onClick={() => setOpen(true)}
          data-testid="sos-open"
        >
          {label}
        </Button>
      )}
      <SosSheet open={open} onOpenChange={setOpen} unitId={unitId} unitName={unitName} />
    </>
  );
}
