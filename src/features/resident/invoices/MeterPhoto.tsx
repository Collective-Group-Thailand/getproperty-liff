"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { LazySheet } from "@/ui/components/overlays";
import { Icon } from "@/ui/icons";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";

/**
 * The detail behind one meter line of an invoice (D-022 evidence): the line itself stays one muted row, and this
 * opens a bottom sheet with the readings labelled one per row, units × price = amount, when the register was read
 * and the photo of the register (`readingPhotoUrl`, the API's short-lived signed link — nothing is cached here).
 *
 * The trigger is the photo's thumbnail when there is one (a real 48-px button), else a quiet "Meter details" text
 * button. Escape, the close button and the scrim close the sheet; focus returns to the trigger (Radix). Every value
 * arrives formatted from the server component — nothing is computed here.
 */
export function MeterDetails({
  title,
  facts,
  formula,
  note,
  photoUrl,
}: {
  /** The line's description ("Water"): the sheet's title. */
  title: string;
  facts: { key: string; label: string; value: string }[];
  /** "12 m³ × 18.00 บาท = ฿216.00", when the API gives a price per unit. */
  formula?: string;
  /** When the register was read, or why the figure is an estimate. */
  note?: string;
  photoUrl?: string | null;
}) {
  const t = useTranslations("resident.invoices.lines");
  const common = useTranslations("common");
  const [open, setOpen] = useState(false);
  return (
    <>
      {photoUrl ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-thumb border-border focus-visible:ring-focus-ring relative size-12 shrink-0 overflow-hidden border focus-visible:ring-2"
          aria-label={t("photoOpenFor", { title })}
          data-testid="meter-photo"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- the API's short-lived signed link */}
          <img src={photoUrl} alt="" width={48} height={48} className="size-full object-cover" loading="lazy" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-primary -me-2 inline-flex min-h-11 shrink-0 items-center gap-0.5 px-2 text-sm font-medium"
          data-testid="meter-details"
        >
          {t("details")}
          <span className="sr-only">{t("detailsOf", { title })}</span>
          <Icon icon={IconChevronRight} className="rtl:rotate-180" />
        </button>
      )}
      <LazySheet open={open} onOpenChange={setOpen} title={title} closeLabel={common("close")}>
        <div className="flex flex-col gap-4 px-5 pb-6">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- the API's short-lived signed link
            <img
              src={photoUrl}
              alt={t("photoAlt", { title })}
              className="rounded-panel border-border bg-bg-subtle max-h-[45dvh] w-full border object-contain"
              data-testid="meter-photo-full"
            />
          ) : null}
          <dl className="divide-border flex flex-col divide-y" data-testid="meter-sheet-readings">
            {facts.map((fact) => (
              <div key={fact.key} className="flex items-baseline justify-between gap-4 py-2.5">
                <dt className="text-muted">{fact.label}</dt>
                <dd className="text-end tabular-nums">{fact.value}</dd>
              </div>
            ))}
          </dl>
          {formula ? (
            <p className="border-border border-t pt-3 font-medium tabular-nums" data-testid="units-times-price">
              {formula}
            </p>
          ) : null}
          {note ? <p className="text-muted text-sm">{note}</p> : null}
        </div>
      </LazySheet>
    </>
  );
}
