import { useTranslations } from "next-intl";

import { kindWords } from "@/features/resident/fees/model";
import { EmptyAction } from "@/features/shared/EmptyAction";
import { Screen, ScreenHeader } from "@/features/shared/Screen";
import { VISIT_STATUS } from "@/domain/status/gate";
import type { Locale } from "@/i18n/routing";
import type { ResidentVisit } from "@/lib/api/types";
import type { MyUnit } from "@/lib/auth/units";
import { StatusBadge } from "@/ui/components/Badge";
import { EmptyState } from "@/ui/components/EmptyState";
import { Icon } from "@/ui/icons";
import { IconInfo } from "@/ui/icons/glyphs/info";
import { IconShield } from "@/ui/icons/glyphs/shield";

import { policyLine, rememberDays, secondsLeft, waiting, type Answer } from "./model";
import { VisitAnswer } from "./VisitAnswer";
import { VisitCountdown } from "./VisitCountdown";
import { VisitCard } from "./VisitParts";

/**
 * A visitor at the gate (J-DESIGN §3 *liff-visitor-approve*, Stitch `liff-visitor-approve.png`): the title names the
 * gate, the lede counts down and names the house policy in the API's words ("ถ้าไม่ตอบใน 3 นาที รปภ. จะโทรหาคุณ"),
 * the card shows what the gate saw, then the one filled action and the household line. A visit that is no longer
 * waiting shows who answered instead of the buttons. A visit that is gone (retention, another unit) is a calm card.
 */
export function VisitScreen({
  visit,
  me,
  answer,
  locale,
  unit,
  now,
}: {
  /** The request's time (the countdown's first value). */
  now: number;
  visit: ResidentVisit | null;
  me: string;
  answer: Answer | null;
  locale: Locale;
  unit: Pick<MyUnit, "propertyKind" | "unitNo"> | null;
}) {
  const t = useTranslations("resident.visitors");
  const status = useTranslations();
  if (!visit) {
    return (
      <Screen testId="visit-screen">
        <EmptyState
          variant="card"
          icon={IconShield}
          title={t("visit.notFound.title")}
          description={t("visit.notFound.body")}
          action={<EmptyAction href="/visitors" label={t("visit.result.all")} />}
        />
      </Screen>
    );
  }
  const open = waiting(visit.state);
  const line = policyLine(visit);
  const seconds = secondsLeft(visit.respondBy, now);
  const kind = kindWords(unit?.propertyKind).unit;
  const badge = VISIT_STATUS[visit.state];
  return (
    <Screen testId="visit-screen" data-visit={visit.id} data-state={visit.state}>
      <ScreenHeader
        title={open ? t("visit.title", { gate: visit.gateName }) : t("visit.titleDone", { gate: visit.gateName })}
        status={<StatusBadge status={badge} label={status(badge.labelKey)} />}
        lede={
          open ? (
            <span data-testid="visit-lede">
              {t("visit.waitingFor")}
              {visit.respondBy && seconds !== null ? (
                <>
                  {" · "}
                  <VisitCountdown respondBy={visit.respondBy} initialSeconds={seconds} />
                </>
              ) : null}
              {" · "}
              <span data-testid="visit-policy" data-action={line.action}>
                {t(`visit.policy.${line.action}`, { minutes: line.minutes })}
              </span>
            </span>
          ) : undefined
        }
      />
      <VisitCard visit={visit} locale={locale} />
      <VisitAnswer
        visit={visit}
        me={me}
        answer={answer}
        rememberDays={rememberDays(visit.policy)}
        minutes={line.minutes}
        locale={locale}
      />
      {open ? (
        <p className="text-muted flex items-start gap-2 text-sm" data-testid="visit-household">
          <Icon icon={IconInfo} className="mt-0.5 shrink-0" aria-hidden />
          <span>{t("visit.household", { kind, unit: visit.unitNo ?? unit?.unitNo ?? "" })}</span>
        </p>
      ) : null}
    </Screen>
  );
}
