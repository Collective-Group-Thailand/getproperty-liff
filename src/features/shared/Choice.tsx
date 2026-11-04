"use client";

import { Field, useFieldGroupProps } from "@/ui/components/Field";
import { Icon, type IconGlyph } from "@/ui/icons";
import { cn } from "@/ui/lib/cn";

/**
 * One-tap choices for the resident app's forms (redesign G2 r2): native radios (keyboard, screen readers, no system
 * picker) drawn as tiles, chips or cards. The selected one is the pale brand tint with brand ink and a brand hairline —
 * never a solid fill: a screen's only solid fill is its primary action.
 */

export interface ChoiceOption {
  value: string;
  label: string;
  icon?: IconGlyph;
  /** One muted line under the label (cards only). */
  hint?: string;
  testId?: string;
}

const tileBase = [
  "rounded-control border-border bg-surface text-fg relative flex cursor-pointer items-center border",
  "duration-fast transition-[background-color,border-color,color]",
  "has-checked:border-primary has-checked:bg-primary-subtle has-checked:text-primary-subtle-fg",
  "has-focus-visible:ring-focus-ring has-focus-visible:ring-2 has-focus-visible:ring-offset-1",
  "has-disabled:cursor-not-allowed has-disabled:opacity-60",
];

/**
 * A titled group of choices: the shared `Field` (label, hint, error and their wiring) around a `radiogroup` named by
 * that label (`useFieldGroupProps`).
 */
export function ChoiceGroup({
  legend,
  hint,
  error,
  required,
  requiredLabel,
  children,
  testId,
  className,
}: {
  legend: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
  requiredLabel?: string;
  children: (describedBy: string | undefined) => React.ReactNode;
  testId?: string;
  className?: string;
}) {
  return (
    <Field
      label={<span className="text-fg text-base font-semibold">{legend}</span>}
      hint={hint}
      error={error}
      required={required}
      requiredLabel={requiredLabel}
      className={cn("gap-3", className)}
    >
      <ChoiceGroupBody testId={testId}>{children}</ChoiceGroupBody>
    </Field>
  );
}

function ChoiceGroupBody({
  children,
  testId,
}: {
  children: (describedBy: string | undefined) => React.ReactNode;
  testId?: string;
}) {
  const group = useFieldGroupProps();
  return (
    <div role="radiogroup" {...group} className="min-w-0" data-testid={testId}>
      {children(group["aria-describedby"])}
    </div>
  );
}

/**
 * Icon tiles (a request's category: 2 columns, icon + label) or chips (urgency, a time window: a row of short words).
 */
export function ChoiceTiles({
  name,
  options,
  value,
  onChange,
  variant = "tile",
  columns = 2,
  disabled,
  describedBy,
}: {
  name: string;
  options: ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  variant?: "tile" | "chip";
  columns?: 2 | 3;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <div className={cn("grid gap-2", columns === 3 ? "grid-cols-3" : "grid-cols-2")}>
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            tileBase,
            variant === "tile" ? "min-h-14 gap-3 px-3 py-2.5" : "min-h-11 justify-center px-2 text-center",
          )}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
            aria-describedby={describedBy}
            className="sr-only"
            data-testid={option.testId}
          />
          {option.icon ? <Icon icon={option.icon} className="shrink-0 text-xl" /> : null}
          <span className={cn("min-w-0 leading-snug", variant === "tile" ? "font-medium" : "text-sm font-medium")}>
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}

/**
 * Radio cards: a radio mark, a title and a hint per option; the selected card can reveal more choices under it
 * (`detail`), e.g. the time windows of "pick a time".
 */
export function ChoiceCards({
  name,
  options,
  value,
  onChange,
  disabled,
  detail,
  describedBy,
}: {
  name: string;
  options: ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Extra controls shown inside the selected card. */
  detail?: Partial<Record<string, React.ReactNode>>;
  describedBy?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <div
            key={option.value}
            className={cn(
              "rounded-card border-border bg-surface duration-fast border transition-[background-color,border-color]",
              selected && "border-primary bg-primary-subtle",
            )}
          >
            <label className="has-focus-visible:ring-focus-ring rounded-card flex min-h-14 cursor-pointer items-start gap-3 px-4 py-3 has-focus-visible:ring-2">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option.value)}
                aria-describedby={describedBy}
                className="peer sr-only"
                data-testid={option.testId}
              />
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2",
                  selected ? "border-primary" : "border-border-strong",
                )}
              >
                {selected ? <span className="bg-primary size-2.5 rounded-full" /> : null}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className={cn("font-medium", selected && "text-primary-subtle-fg")}>{option.label}</span>
                {option.hint ? <span className="text-muted text-sm">{option.hint}</span> : null}
              </span>
            </label>
            {selected && detail?.[option.value] ? <div className="px-4 ps-12 pb-4">{detail[option.value]}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
