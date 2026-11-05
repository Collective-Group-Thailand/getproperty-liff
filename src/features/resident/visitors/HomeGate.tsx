import { useTranslations } from "next-intl";

import { SosLauncher } from "@/features/resident/sos/SosLauncher";
import { List, Section, SectionLink, type ListRow } from "@/features/shared/Screen";
import type { Locale } from "@/i18n/routing";
import type { Incident, Visit } from "@/lib/api/types";
import { IconAdd } from "@/ui/icons/glyphs/add";
import { IconCar } from "@/ui/icons/glyphs/car";
import { IconShieldAlert } from "@/ui/icons/glyphs/shield-alert";

import { plateText } from "./model";
import { KIND_ICON } from "./VisitParts";
import { whenText } from "./words";

export interface HomeGateData {
  unitId: string;
  /** "บ้าน 88/12". */
  unitName: string;
  waiting: Visit[];
  /** A gate of the estate opens for a registered car of mine. */
  canOpen: boolean;
  /** I may create passes (the household, not family). */
  canInvite: boolean;
  sos: Incident | null;
}

/**
 * The gate on home (JRL decision 4 deferred it to JL4): a visitor waiting for my answer comes first and in bold, then
 * the quick actions — open the barrier (only with a registered car where the estate allows it), a pass for a visitor —
 * and an emergency row that opens the SOS sheet. An SOS in progress replaces nothing: it is the first row.
 */
export function HomeGate({ gate, today, locale }: { gate: HomeGateData; today: string; locale: Locale }) {
  const t = useTranslations("resident.visitors.home");
  const words = useTranslations("resident.visitors");
  const rows: ListRow[] = [
    ...(gate.sos
      ? [
          {
            key: "sos",
            href: `/sos/${gate.sos.id}`,
            icon: IconShieldAlert,
            strong: true,
            title: words(`sos.live.${gate.sos.state === "acknowledged" ? "acknowledged" : "open"}`),
            meta: words(`sos.kind.${gate.sos.kind}`),
            testId: "home-sos-live",
          },
        ]
      : []),
    ...gate.waiting.map((visit) => ({
      key: visit.id,
      href: `/visits/${visit.id}`,
      icon: KIND_ICON[visit.kind],
      strong: true,
      title: t("waiting", {
        who: plateText(visit.plate) || visit.visitorName || words(`kind.${visit.kind}`),
        gate: visit.gateName,
      }),
      meta: t("waitingMeta", { time: whenText(visit.createdAt, today, locale) }),
      testId: "home-visit-waiting",
    })),
    ...(gate.canOpen
      ? [
          {
            key: "open",
            href: "/visitors/open",
            icon: IconCar,
            title: t("open"),
            meta: t("openMeta"),
            testId: "home-open-barrier",
          },
        ]
      : []),
    ...(gate.canInvite
      ? [
          {
            key: "invite",
            href: "/visitors/invites/new",
            icon: IconAdd,
            title: t("invite"),
            meta: t("inviteMeta"),
            testId: "home-invite",
          },
        ]
      : []),
  ];
  return (
    <Section
      title={t("title")}
      titleId="home-gate-title"
      testId="home-gate"
      action={<SectionLink href="/visitors">{t("all")}</SectionLink>}
    >
      {rows.length ? <List rows={rows} /> : null}
      <SosLauncher unitId={gate.unitId} unitName={gate.unitName} label={t("sos")} hint={t("sosHint")} variant="row" />
    </Section>
  );
}
