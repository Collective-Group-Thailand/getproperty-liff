"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { formatTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/ui/lib/cn";

import { slotsByDay, type Slot } from "./model";

/**
 * Viewing times as a person picks them on a phone (L5 5.1): the days that have a free time as a row of chips, then
 * that day's times as large buttons — no calendar grid to squint at, only times the owner really offers.
 */
export function SlotPicker({
  slots,
  value,
  onChange,
  testId = "slot-picker",
}: {
  slots: Slot[];
  value: string | null;
  onChange: (startsAt: string) => void;
  testId?: string;
}) {
  const t = useTranslations("prospect.rent.book");
  const locale = useLocale() as Locale;
  const days = slotsByDay(slots);
  const [day, setDay] = useState(() => days[0]?.day ?? null);
  const current = days.find((d) => d.day === day) ?? days[0];
  if (!current) return null;
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t("day")}</legend>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map(({ day: d }) => {
            const noon = new Date(`${d}T12:00:00+07:00`);
            const selected = d === current.day;
            const part = (options: Intl.DateTimeFormatOptions) =>
              new Intl.DateTimeFormat(locale, { ...options, timeZone: "Asia/Bangkok" }).format(noon);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={selected}
                onClick={() => setDay(d)}
                className={cn(
                  "rounded-card relative flex min-h-16 w-16 shrink-0 flex-col items-center justify-center border text-sm whitespace-nowrap",
                  selected
                    ? "border-primary bg-primary-subtle text-primary-subtle-fg font-semibold"
                    : "border-border bg-surface",
                )}
                data-testid="slot-day"
              >
                {/* WCAG 2.5.3: no aria-label over visible text — the full date is read, the short card is seen. */}
                <span className="sr-only">
                  {part({ weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </span>
                <span aria-hidden="true" className="text-xs">
                  {part({ weekday: "short" })}
                </span>
                <span aria-hidden="true" className="text-lg leading-tight font-semibold tabular-nums">
                  {part({ day: "numeric" })}
                </span>
                <span aria-hidden="true" className="text-xs">
                  {part({ month: "short" })}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t("time")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {current.slots.map((slot) => {
            const selected = slot.startsAt === value;
            return (
              <button
                key={slot.startsAt}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(slot.startsAt)}
                className={cn(
                  "rounded-card",
                  selected ? "border-primary bg-primary text-primary-fg font-semibold" : "border-border bg-surface",
                )}
                data-testid="slot-time"
              >
                {formatTime(slot.startsAt, locale)}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
