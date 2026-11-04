import { getTranslations } from "next-intl/server";

import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { Badge } from "@/ui/components/Badge";
import { Icon } from "@/ui/icons";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconWarning } from "@/ui/icons/glyphs/warning";
import { cn } from "@/ui/lib/cn";

import { needsAttention, type DueState } from "./model";

/**
 * The due date in words (D-100): "due in 5 days", "due today", "3 days late" — an amber badge (icon and words, never
 * colour alone) only when the resident should act now; never red for an invoice that is merely due.
 */
export async function Due({
  state,
  dueDate,
  locale,
  className,
  variant = "line",
}: {
  state: DueState;
  dueDate: string;
  locale: Locale;
  className?: string;
  /**
   * `badge` (the home bill card's header row): the words alone in a small badge — amber when the resident should act
   * now, neutral otherwise (D-100); the date itself is printed under the amount.
   */
  variant?: "line" | "badge";
}) {
  const t = await getTranslations("resident.invoices.due");
  const date = formatDate(dueDate, locale);
  if (variant === "badge" && state.kind !== "paid" && state.kind !== "void") {
    const short =
      state.kind === "overdue"
        ? t("short.overdue", { days: state.days })
        : state.kind === "today"
          ? t("short.today")
          : t("short.inDays", { days: state.days });
    return (
      <span className={cn("shrink-0", className)} data-testid="invoice-due" data-due={state.kind}>
        <Badge
          tone={needsAttention(state) ? "warning" : "neutral"}
          icon={needsAttention(state) ? IconWarning : IconClock}
        >
          {short}
        </Badge>
      </span>
    );
  }
  const text =
    state.kind === "overdue"
      ? t("overdue", { days: state.days, date })
      : state.kind === "today"
        ? t("today", { date })
        : state.kind === "soon" || state.kind === "later"
          ? t("inDays", { days: state.days, date })
          : state.kind === "paid"
            ? t("paid")
            : t("void");
  if (needsAttention(state)) {
    return (
      <p className={cn("text-sm", className)} data-testid="invoice-due" data-due={state.kind}>
        <Badge tone="warning" icon={IconWarning}>
          {text}
        </Badge>
      </p>
    );
  }
  return (
    <p
      className={cn("text-muted flex items-center gap-1.5 text-sm", className)}
      data-testid="invoice-due"
      data-due={state.kind}
    >
      {state.kind === "paid" || state.kind === "void" ? null : <Icon icon={IconClock} />}
      {text}
    </p>
  );
}
