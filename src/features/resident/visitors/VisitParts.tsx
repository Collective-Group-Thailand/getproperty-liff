import { useTranslations } from "next-intl";

import type { Locale } from "@/i18n/routing";
import type { ResidentVisit, VisitKind } from "@/lib/api/types";
import { Icon, type IconGlyph } from "@/ui/icons";
import { IconCar } from "@/ui/icons/glyphs/car";
import { IconCctv } from "@/ui/icons/glyphs/cctv";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconHammer } from "@/ui/icons/glyphs/hammer";
import { IconHistory } from "@/ui/icons/glyphs/history";
import { IconLogIn } from "@/ui/icons/glyphs/log-in";
import { IconMore } from "@/ui/icons/glyphs/more";
import { IconPhone } from "@/ui/icons/glyphs/phone";
import { IconResident } from "@/ui/icons/glyphs/resident";
import { IconTruck } from "@/ui/icons/glyphs/truck";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";
import { cn } from "@/ui/lib/cn";

import { useClockTime } from "./clockTime";
import { plateText, type VisitResult } from "./model";

/** One glyph per visitor kind (the tablet's kind tiles use the same set, J-DESIGN §3 gate). */
export const KIND_ICON: Record<VisitKind, IconGlyph> = {
  guest: IconResident,
  delivery: IconTruck,
  contractor: IconHammer,
  resident_vehicle: IconCar,
  other: IconMore,
};

/**
 * The visitor as the gate saw them (J-DESIGN §3 *liff-visitor-approve*): the camera frame with the gate and the time,
 * then the plate card and three facts. Without a photo the plate itself is the picture — a calm tinted panel with the
 * plate in mono, never a stock car image; without a plate either (someone on foot), the kind and name carry it.
 */
export function VisitCard({ visit, locale }: { visit: ResidentVisit; locale: Locale }) {
  const t = useTranslations("resident.visitors");
  const time = useClockTime(locale);
  const plate = plateText(visit.plate);
  const arrived = time(visit.createdAt);
  return (
    <section
      aria-label={t("visit.cardLabel")}
      className="rounded-card border-border bg-surface shadow-card overflow-hidden border"
      data-testid="visit-card"
    >
      {visit.photoUrl ? (
        <figure className="relative">
          {/* A 5-minute signed link from the API (the gate camera): a plain img, never optimised or cached. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={visit.photoUrl}
            alt={t("visit.photoAlt", { gate: visit.gateName, time: arrived })}
            className="aspect-video w-full object-cover"
            data-testid="visit-photo"
          />
          <figcaption className="pointer-events-none absolute inset-x-3 top-3 flex items-start justify-between gap-2">
            <span className="bg-surface text-fg rounded-thumb border-border inline-flex items-center gap-1.5 border px-2 py-1 text-xs font-medium">
              <Icon icon={IconCctv} aria-hidden />
              {t("visit.camera", { gate: visit.gateName })}
            </span>
          </figcaption>
          <span className="bg-surface text-fg rounded-thumb border-border absolute end-3 bottom-3 border px-2 py-1 font-mono text-xs tabular-nums">
            {arrived}
          </span>
        </figure>
      ) : (
        <div
          className="bg-bg-subtle border-border flex flex-col items-center justify-center gap-2 border-b px-4 py-7 text-center"
          data-testid="visit-placeholder"
        >
          <Icon icon={plate ? IconCar : KIND_ICON[visit.kind]} className="text-subtle text-3xl" aria-hidden />
          {plate ? (
            <>
              <p className="font-mono text-3xl font-semibold tracking-wide" data-testid="visit-plate">
                {plate}
              </p>
              <p className="text-muted text-sm">{visit.plate?.province}</p>
            </>
          ) : null}
          <p className="text-muted text-sm">{plate ? t("visit.noPhoto") : t("visit.noPhotoNoPlate")}</p>
        </div>
      )}
      <div className="flex flex-col gap-4 p-4">
        {visit.photoUrl && plate ? (
          <div className="border-border bg-bg-subtle rounded-control flex items-center justify-between gap-3 border px-4 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-muted text-sm">{t("visit.plate")}</span>
              <span className="font-mono text-3xl font-semibold tracking-wide" data-testid="visit-plate">
                {plate}
              </span>
            </div>
            <span className="border-border rounded-thumb bg-surface shrink-0 border px-2 py-1 text-sm">
              {visit.plate?.province}
            </span>
          </div>
        ) : null}
        <dl className="divide-border grid grid-cols-3 divide-x text-sm rtl:divide-x-reverse" data-testid="visit-facts">
          <div className="flex min-w-0 flex-col gap-1 pe-3">
            <dt className="text-muted">{t("visit.facts.kind")}</dt>
            <dd className="flex items-center gap-1.5 text-base font-medium">
              <Icon icon={KIND_ICON[visit.kind]} className="text-primary shrink-0" aria-hidden />
              <span className="truncate">{t(`kind.${visit.kind}`)}</span>
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1 px-3">
            <dt className="text-muted">{t("visit.facts.name")}</dt>
            <dd className={cn("text-base font-medium break-words", !visit.visitorName && "text-muted font-normal")}>
              {visit.visitorName ?? t("visit.facts.noName")}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1 ps-3">
            <dt className="text-muted">{t("visit.facts.arrived")}</dt>
            <dd className="font-mono text-base font-medium tabular-nums">{arrived}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

const RESULT_ICON: Record<VisitResult["kind"], { icon: IconGlyph; className: string }> = {
  approved: { icon: IconCheckCircle, className: "text-success" },
  entered: { icon: IconLogIn, className: "text-info" },
  denied: { icon: IconXCircle, className: "text-muted" },
  timed_out: { icon: IconClock, className: "text-muted" },
  exited: { icon: IconHistory, className: "text-muted" },
  cancelled: { icon: IconXCircle, className: "text-muted" },
  call_me: { icon: IconPhone, className: "text-primary" },
  waiting: { icon: IconClock, className: "text-muted" },
};

/**
 * After any answer the actions give way to this card (J-DESIGN §3): who of the household answered and when — "you"
 * when it was me — or, after the clock ran out, what the house policy did. Pure presentation: the server page renders
 * it for a visit already answered, `VisitAnswer` right after my own answer.
 */
export function VisitResultCard({
  visit,
  result,
  me,
  minutes,
  locale,
  children,
}: {
  visit: Pick<ResidentVisit, "gateName">;
  result: VisitResult;
  /** My display name — "you" instead of my own name. */
  me: string;
  minutes: number;
  locale: Locale;
  /** A follow-up action (mark exit). */
  children?: React.ReactNode;
}) {
  const t = useTranslations("resident.visitors.visit.result");
  const time = useClockTime(locale);
  const mine = result.by !== null && result.by === me;
  const who = mine ? "you" : result.by ? "named" : "nobody";
  let title: string;
  switch (result.kind) {
    case "approved":
    case "denied":
      title = t(`${result.kind}.${who}`, { name: result.by ?? "" });
      break;
    case "timed_out":
      title = t(`timedOut.${result.policy ?? "guard_calls"}`, { minutes });
      break;
    default:
      title = t(result.kind);
  }
  const { icon, className } = RESULT_ICON[result.kind];
  return (
    <section
      className="rounded-card border-border bg-surface shadow-card flex flex-col gap-3 border p-4"
      aria-live="polite"
      data-testid="visit-result"
      data-result={result.kind}
      data-someone-else={result.someoneElse ? "true" : undefined}
    >
      <div className="flex items-start gap-3">
        <span
          className="bg-bg-subtle rounded-control grid size-10 shrink-0 place-items-center text-xl"
          aria-hidden="true"
        >
          <Icon icon={icon} className={className} />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 className="text-lg font-semibold text-pretty">{title}</h2>
          <p className="text-muted text-sm">
            {result.at ? t("at", { time: time(result.at), gate: visit.gateName }) : visit.gateName}
          </p>
        </div>
      </div>
      {result.someoneElse ? <p className="text-muted text-sm">{t("someoneElse")}</p> : null}
      {children}
    </section>
  );
}
