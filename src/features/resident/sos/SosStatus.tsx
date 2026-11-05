import { useTranslations } from "next-intl";
import Link from "next/link";

import { Screen, ScreenHeader } from "@/features/shared/Screen";
import { EmptyAction } from "@/features/shared/EmptyAction";
import { INCIDENT_STATUS } from "@/domain/status/gate";
import { formatTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { Incident, IncidentKind } from "@/lib/api/types";
import { StatusBadge } from "@/ui/components/Badge";
import { Callout } from "@/ui/components/Callout";
import { EmptyState } from "@/ui/components/EmptyState";
import { Icon } from "@/ui/icons";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconPhone } from "@/ui/icons/glyphs/phone";
import { IconShieldAlert } from "@/ui/icons/glyphs/shield-alert";
import { cn } from "@/ui/lib/cn";

import { RefreshWhileVisible } from "../visitors/RefreshWhileVisible";
import { SosCancel } from "./SosCancel";

/** National emergency numbers (Thailand) by kind: medical 1669, fire 199, police 191. Not settings — the law's lines. */
const HOTLINE: Record<IncidentKind, string> = { medical: "1669", fire: "199", intrusion: "191", other: "191" };

/** An open SOS re-reads itself this often while visible (behind realtime `gate.incident.*`). */
export const SOS_POLL_MS = 10_000;

/**
 * My SOS after sending (D-317, D-328): what happened and where, then the three steps — sent to every gate and the
 * office, taken by the guard, closed — each with its time, never a step the API did not report. Cancel while the
 * window is open. The national hotline for the kind is one tap away: the estate's guard is not an ambulance.
 */
export function SosStatus({
  incident,
  existing,
  locale,
}: {
  incident: Incident | null;
  existing: boolean;
  locale: Locale;
}) {
  const t = useTranslations("resident.visitors.sos.status");
  const words = useTranslations("resident.visitors");
  const status = useTranslations();
  if (!incident) {
    return (
      <Screen testId="sos-screen">
        <EmptyState
          variant="card"
          icon={IconShieldAlert}
          title={t("notFound.title")}
          description={t("notFound.body")}
          action={<EmptyAction href="/visitors" />}
        />
      </Screen>
    );
  }
  const live = incident.state === "open" || incident.state === "acknowledged";
  const badge = INCIDENT_STATUS[incident.state];
  const time = (iso: string | null) => (iso ? words("time", { time: formatTime(iso, locale) }) : null);
  const steps = [
    { key: "sent", at: incident.createdAt, done: true },
    { key: "acknowledged", at: incident.acknowledgedAt, done: Boolean(incident.acknowledgedAt) },
    { key: "resolved", at: incident.resolvedAt, done: Boolean(incident.resolvedAt) },
  ];
  const hotline = HOTLINE[incident.kind];
  return (
    <Screen testId="sos-screen" data-state={incident.state}>
      {live ? <RefreshWhileVisible every={SOS_POLL_MS} /> : null}
      <ScreenHeader
        title={t(`title.${incident.state}`)}
        status={<StatusBadge status={badge} label={status(badge.labelKey)} />}
        lede={t("lede", {
          kind: words(`sos.kind.${incident.kind}`),
          unit: incident.unit?.unitNo ?? "",
          time: time(incident.createdAt) ?? "",
        })}
      />
      {existing ? (
        <div data-testid="sos-existing">
          <Callout tone="info" size="sm">
            {t("existing")}
          </Callout>
        </div>
      ) : null}

      {incident.state === "cancelled" ? (
        <p className="text-muted" data-testid="sos-cancelled">
          {t("cancelledAt", { time: time(incident.cancelledAt) ?? "" })}
        </p>
      ) : (
        <ol
          className="rounded-card border-border bg-surface shadow-card flex flex-col gap-0 border p-4"
          data-testid="sos-steps"
        >
          {steps.map((step, index) => (
            <li key={step.key} className="flex gap-3" data-step={step.key} data-done={step.done ? "true" : "false"}>
              <span className="flex flex-col items-center">
                <Icon
                  icon={step.done ? IconCheckCircle : IconClock}
                  className={cn("mt-0.5 shrink-0 text-xl", step.done ? "text-success" : "text-subtle")}
                  aria-hidden
                />
                {index < steps.length - 1 ? (
                  <span className={cn("my-1 w-px flex-1", step.done ? "bg-success/40" : "bg-border")} />
                ) : null}
              </span>
              <span className={cn("flex min-w-0 flex-col", index < steps.length - 1 && "pb-4")}>
                <span className={cn("font-medium", !step.done && "text-muted font-normal")}>
                  {t(`steps.${step.key}`)}
                </span>
                <span className="text-muted text-sm">{step.done ? time(step.at) : t(`steps.${step.key}Waiting`)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {incident.note ? (
        <p className="text-muted text-sm" data-testid="sos-note-shown">
          {t("note", { note: incident.note })}
        </p>
      ) : null}

      {live ? (
        <a
          href={`tel:${hotline}`}
          className="rounded-control border-border-strong bg-surface text-fg flex h-12 items-center justify-center gap-2 border px-4 font-medium"
          data-testid="sos-hotline"
        >
          <Icon icon={IconPhone} aria-hidden />
          {t(`hotline.${incident.kind}`, { number: hotline })}
        </a>
      ) : null}

      {incident.cancellableUntil ? <SosCancel incidentId={incident.id} until={incident.cancellableUntil} /> : null}

      <Link href="/visitors" className="text-primary inline-flex min-h-11 items-center self-start text-sm font-medium">
        {t("back")}
      </Link>
    </Screen>
  );
}
