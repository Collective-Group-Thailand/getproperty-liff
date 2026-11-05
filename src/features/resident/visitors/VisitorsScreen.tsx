import { useTranslations } from "next-intl";
import Link from "next/link";

import { kindWords } from "@/features/resident/fees/model";
import { SosLauncher } from "@/features/resident/sos/SosLauncher";
import { EmptyAction } from "@/features/shared/EmptyAction";
import { List, Screen, ScreenHeader, Section, SectionLink, type ListRow } from "@/features/shared/Screen";
import { INVITE_STATUS, VISIT_STATUS } from "@/domain/status/gate";
import type { Locale } from "@/i18n/routing";
import type { Incident, OpenableGate, ResidentGate, Visit, VisitInvite } from "@/lib/api/types";
import type { MyUnit } from "@/lib/auth/units";
import { StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { EmptyState } from "@/ui/components/EmptyState";
import { Icon } from "@/ui/icons";
import { IconAdd } from "@/ui/icons/glyphs/add";
import { IconCar } from "@/ui/icons/glyphs/car";
import { IconQr } from "@/ui/icons/glyphs/qr";
import { IconSettings } from "@/ui/icons/glyphs/settings";
import { IconShield } from "@/ui/icons/glyphs/shield";
import { IconShieldAlert } from "@/ui/icons/glyphs/shield-alert";

import { bangkokDay, plateText } from "./model";
import { OpenBarrier } from "./OpenBarrier";
import { RefreshWhileVisible } from "./RefreshWhileVisible";
import { KIND_ICON } from "./VisitParts";
import { WAITING_POLL_MS } from "./VisitCountdown";
import { whenText, windowText } from "./words";

/** One visit as a row: the plate (mono) or the name, kind · time · gate, the state badge. */
export function useVisitRow(locale: Locale, today: string) {
  const t = useTranslations("resident.visitors");
  const status = useTranslations();
  return (visit: Visit): ListRow => {
    const plate = plateText(visit.plate);
    const badge = VISIT_STATUS[visit.state];
    return {
      key: visit.id,
      href: `/visits/${visit.id}`,
      icon: KIND_ICON[visit.kind],
      title: plate ? <span className="font-mono">{plate}</span> : (visit.visitorName ?? t(`kind.${visit.kind}`)),
      meta:
        plate && visit.visitorName
          ? t("rowNamed", {
              kind: t(`kind.${visit.kind}`),
              name: visit.visitorName,
              time: whenText(visit.createdAt, today, locale),
            })
          : t("row", {
              kind: t(`kind.${visit.kind}`),
              time: whenText(visit.createdAt, today, locale),
              gate: visit.gateName,
            }),
      endMeta: <StatusBadge status={badge} label={status(badge.labelKey)} size="sm" />,
      strong: visit.state === "requested",
      testId: "visit-row",
      data: { "data-state": visit.state },
    };
  };
}

/**
 * `/visitors` (JL4) — the household's gate on one screen: an SOS in progress first, visitors waiting for an answer,
 * the barrier (the one filled action, when the estate lets residents open it), today's visitors, invites, then the
 * cars and the house policy as rows. Own unit only (D-327); words follow the place (ห้อง / บ้าน).
 */
export function VisitorsScreen({
  unit,
  gate,
  visits,
  invites,
  openable,
  incidents,
  counts,
  today,
  locale,
}: {
  unit: MyUnit;
  gate: ResidentGate | null;
  visits: Visit[];
  invites: VisitInvite[];
  openable: OpenableGate[];
  incidents: Incident[];
  counts: { cars: number; remembered: number };
  today: string;
  locale: Locale;
}) {
  const t = useTranslations("resident.visitors");
  const status = useTranslations();
  const shell = useTranslations("shell.unitSwitcher");
  const kind = kindWords(unit.propertyKind).unit;
  const unitName = shell("unit", { unit: unit.unitNo, kind });
  const visitRow = useVisitRow(locale, today);

  if (!gate || gate.gates.length === 0) {
    return (
      <Screen testId="visitors-screen">
        <ScreenHeader title={t("title")} />
        <EmptyState
          variant="card"
          icon={IconShield}
          title={t("notInUse.title")}
          description={t("notInUse.body")}
          action={<EmptyAction />}
        />
      </Screen>
    );
  }

  const waitingNow = visits.filter((v) => v.state === "requested");
  const todays = visits.filter((v) => v.state !== "requested" && bangkokDay(v.createdAt) === today);
  const liveInvites = invites.filter((i) => i.state === "active" || i.state === "pending_approval");
  const liveSos = incidents.find((i) => i.state === "open" || i.state === "acknowledged");
  const usable = openable.filter((g) => g.enabled && g.vehicles.length > 0);
  const anyBarrier = openable.length > 0;
  const policyMinutes = Math.max(1, Math.round(gate.policy.timeoutSeconds / 60));

  return (
    <Screen testId="visitors-screen">
      {waitingNow.length ? <RefreshWhileVisible every={WAITING_POLL_MS} /> : null}
      <ScreenHeader
        title={t("title")}
        lede={t("lede", { unit: unitName, gates: gate.gates.map((g) => g.name).join(" · ") })}
        status={<SosLauncher unitId={unit.unitId} unitName={unitName} label={t("sos.entry")} />}
      />

      {liveSos ? (
        <div data-testid="visitors-sos-live">
          <Callout
            tone={liveSos.state === "open" ? "danger" : "info"}
            icon={IconShieldAlert}
            title={t(`sos.live.${liveSos.state === "acknowledged" ? "acknowledged" : "open"}`)}
            action={
              <Link href={`/sos/${liveSos.id}`} className="font-medium underline underline-offset-4">
                {t("sos.liveOpen")}
              </Link>
            }
          >
            {t(`sos.kind.${liveSos.kind}`)}
          </Callout>
        </div>
      ) : null}

      {waitingNow.length ? (
        <Section
          title={t("waiting.title", { count: waitingNow.length })}
          titleId="visitors-waiting"
          testId="visitors-waiting"
        >
          <List rows={waitingNow.map(visitRow)} />
        </Section>
      ) : null}

      {usable.length ? (
        <OpenBarrier gates={usable} locale={locale} />
      ) : anyBarrier ? (
        <p className="text-muted flex items-start gap-2 text-sm" data-testid="open-unavailable">
          <Icon icon={IconCar} className="mt-0.5 shrink-0" aria-hidden />
          {openable.every((g) => !g.enabled) ? (
            t("open.disabled")
          ) : gate.canEdit ? (
            <span>
              {t("open.noCars")}{" "}
              <Link href="/visitors/cars" className="text-primary font-medium">
                {t("open.addCar")}
              </Link>
            </span>
          ) : (
            t("open.noCarsFamily")
          )}
        </p>
      ) : null}

      <Section
        title={t("today.title")}
        titleId="visitors-today"
        testId="visitors-today"
        action={<SectionLink href="/visitors/history">{t("history.link")}</SectionLink>}
      >
        {todays.length ? (
          <List rows={todays.map(visitRow)} />
        ) : (
          <p className="rounded-card border-border bg-surface text-muted border px-4 py-4 text-sm">
            {t("today.empty")}
          </p>
        )}
      </Section>

      <Section
        title={t("invites.title")}
        titleId="visitors-invites"
        testId="visitors-invites"
        action={
          gate.canEdit && liveInvites.length ? (
            <SectionLink href="/visitors/invites/new" testId="invite-create-link">
              {t("invites.create")}
            </SectionLink>
          ) : undefined
        }
      >
        {liveInvites.length ? (
          <List
            rows={liveInvites.map((invite) => ({
              key: invite.id,
              href: `/visitors/invites/${invite.id}`,
              icon: IconQr,
              title: invite.visitorName ?? t(`kind.${invite.visitorKind}`),
              meta: windowText(invite.validFrom, invite.validTo, locale),
              endMeta: (
                <StatusBadge
                  status={INVITE_STATUS[invite.state]}
                  label={status(INVITE_STATUS[invite.state].labelKey)}
                  size="sm"
                />
              ),
              testId: "invite-row",
            }))}
          />
        ) : (
          <div className="rounded-card border-border bg-surface flex flex-col gap-3 border px-4 py-4">
            <p className="text-muted text-sm">{t(gate.canEdit ? "invites.empty" : "invites.emptyFamily")}</p>
            {gate.canEdit ? (
              <Button asChild variant="secondary" iconStart={IconAdd} className="self-start">
                <Link href="/visitors/invites/new" data-testid="invite-create-link">
                  {t("invites.create")}
                </Link>
              </Button>
            ) : null}
          </div>
        )}
      </Section>

      <Section title={t("household.title", { kind })} titleId="visitors-household" testId="visitors-household">
        <List
          rows={[
            {
              key: "cars",
              href: "/visitors/cars",
              icon: IconCar,
              title: t("cars.title"),
              meta: t("cars.summary", { cars: counts.cars, remembered: counts.remembered }),
              testId: "visitors-cars-row",
            },
            {
              key: "policy",
              href: "/visitors/policy",
              icon: IconSettings,
              title: t("policy.title"),
              meta: t(`policy.summary.${gate.policy.action}`, { minutes: policyMinutes }),
              testId: "visitors-policy-row",
            },
          ]}
        />
      </Section>

      <p className="text-muted text-sm" data-testid="visitors-privacy">
        {t("privacy", { days: gate.privacyNotice.retentionDays })}{" "}
        <Link href="/visitors/policy#privacy" className="text-primary font-medium">
          {t("privacyMore")}
        </Link>
      </p>
    </Screen>
  );
}
