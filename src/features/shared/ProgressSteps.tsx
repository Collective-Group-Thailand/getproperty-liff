import { Icon, type IconGlyph } from "@/ui/icons";
import { IconCheck } from "@/ui/icons/glyphs/check";
import { cn } from "@/ui/lib/cn";

/**
 * Where a job stands (redesign G2 r2): three or four steps in a row, each an icon above its label — done steps are a
 * check in the pale brand tint, the current one a brand outline with brand ink, the rest muted. Pure display of the
 * API's status (the caller maps it to `current`); never a control. `current === steps.length` means all done.
 */
export function ProgressSteps({
  steps,
  current,
  label,
  doneLabel,
  testId,
  className,
}: {
  steps: { key: string; label: string; icon: IconGlyph }[];
  current: number;
  /** Accessible name of the list, from `src/i18n`. */
  label: string;
  /** Read after a done step's label by screen readers ("done"), from `src/i18n`. */
  doneLabel: string;
  testId?: string;
  className?: string;
}) {
  return (
    <ol
      aria-label={label}
      className={cn("rounded-card border-border bg-surface shadow-card flex border px-2 py-4", className)}
      data-testid={testId}
      data-current={current}
    >
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={step.key}
            aria-current={active ? "step" : undefined}
            className="relative flex flex-1 flex-col items-center gap-2 text-center"
          >
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute start-[calc(-50%+1.5rem)] end-[calc(50%+1.5rem)] top-4.5 h-px",
                  done || active ? "bg-primary/40" : "bg-border",
                )}
              />
            ) : null}
            <span
              className={cn(
                "grid size-9 place-items-center rounded-full border text-base",
                done && "bg-primary-subtle text-primary border-transparent",
                active && "border-primary text-primary bg-surface border-[1.5px]",
                !done && !active && "border-border text-subtle",
              )}
            >
              <Icon icon={done ? IconCheck : step.icon} />
            </span>
            <span
              className={cn(
                "text-sm leading-tight font-medium",
                active ? "text-primary-subtle-fg font-semibold" : done ? "text-fg" : "text-muted",
              )}
            >
              {step.label}
              {done ? <span className="sr-only">{doneLabel}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
