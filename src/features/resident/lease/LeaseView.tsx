import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { LEASE_STATUS } from "@/domain/status/lease";
import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { LeaseView as Lease } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { ActionDock, Facts, List, PaperDocument, Screen, ScreenHeader, Section } from "@/features/shared/Screen";
import { StatusBadge } from "@/ui/components/Badge";
import { IconCalendar } from "@/ui/icons/glyphs/calendar";
import { IconShield } from "@/ui/icons/glyphs/shield";
import { IconSign } from "@/ui/icons/glyphs/sign";

import { ContractButton } from "./ContractButton";
import { RulesAcknowledge } from "./RulesAcknowledge";

/** Clause types that make up the building rules the resident acknowledges (the lease's addendum, D-020). */
const RULE_TYPES = new Set(["house_rules", "pets", "smoking", "guests", "quiet_hours", "parking_rules", "waste"]);

/**
 * The lease as the API returns it (B2.3): status, the unit and building, who is on it (lessee, co-residents —
 * names the API withholds stay hidden, D-152), term, rent, deposit and recurring charges, the building rules of its
 * addendum (with their acknowledgement, `acknowledge-rules`), the notice when one was given, and the actions the
 * API offers (`nextActions`: view the lease document, sign, give notice). Nothing is computed here.
 */
export async function LeaseView({
  lease,
  locale,
  depositId,
  children,
}: {
  lease: Lease;
  locale: Locale;
  depositId?: string;
  /** The page's other sections about this lease (letters, inspections, documents, review), in the same rhythm. */
  children?: React.ReactNode;
}) {
  const t = await getTranslations("resident.lease");
  const status = await getTranslations();
  const money = (value: string) => formatTHB(value, locale);
  const date = (value: string) => formatDate(value, locale);
  const rules = lease.addendum.filter((clause) => RULE_TYPES.has(clause.type));
  const other = lease.addendum.filter((clause) => !RULE_TYPES.has(clause.type));
  const actions = new Set(lease.nextActions);

  const related = [
    ...(actions.has("give-notice")
      ? [
          {
            key: "notice",
            href: `/lease/${lease.id}/notice`,
            icon: IconCalendar,
            title: t("view.noticeCta"),
            meta: t("view.noticeHint"),
            testId: "lease-notice",
          },
        ]
      : []),
    ...(depositId
      ? [
          {
            key: "deposit",
            href: `/deposit/${depositId}`,
            icon: IconShield,
            title: t("view.depositCta"),
            meta: t("view.depositHint"),
            testId: "lease-deposit",
          },
        ]
      : []),
  ];

  return (
    <Screen testId="lease-view">
      <ScreenHeader
        back={{ href: "/", label: t("back.home") }}
        title={t("view.title", { unit: lease.unitNo })}
        status={<StatusBadge status={LEASE_STATUS[lease.status]} label={status(LEASE_STATUS[lease.status].labelKey)} />}
        lede={t("view.subtitle", { building: lease.buildingName, operator: lease.tenantName })}
      />

      {actions.has("sign") ? (
        <Callout tone="info" title={t("view.signTitle")}>
          {t("view.signBody")}
        </Callout>
      ) : lease.status === "pending_signature" ? (
        <div data-testid="lease-waiting">
          <Callout tone="info" title={t("view.waitingTitle")}>
            {t("view.waitingBody")}
          </Callout>
        </div>
      ) : null}

      {lease.notice ? (
        <Callout tone="info" icon={IconCalendar} title={t("notice.givenTitle")}>
          {lease.notice.effectiveDate
            ? t("notice.givenBody", { date: date(lease.notice.effectiveDate), given: date(lease.notice.givenAt) })
            : t("notice.givenNoDate", { given: date(lease.notice.givenAt) })}
        </Callout>
      ) : null}

      <PaperDocument
        issuer={lease.tenantName}
        kind={t("view.documentKind")}
        number={lease.number ?? undefined}
        labelledBy="terms-title"
        facts={[
          { key: "unit", label: t("terms.unit"), value: lease.unitNo },
          { key: "utilities", label: t("terms.utilities"), value: t(`terms.utilityMode.${lease.utilityBillingMode}`) },
        ]}
        footer={
          actions.has("view-contract") ? (
            <ContractButton leaseId={lease.id} signed={lease.status !== "pending_signature"} />
          ) : undefined
        }
      >
        <h3 className="sr-only">{t("terms.title")}</h3>
        <Facts
          items={[
            {
              key: "term",
              label: t("terms.term"),
              value: t("terms.termValue", {
                start: date(lease.startDate),
                end: date(lease.endDate),
                months: lease.months,
              }),
            },
            { key: "rent", label: t("terms.rent"), value: t("terms.perMonth", { amount: money(lease.rent) }) },
            { key: "deposit", label: t("terms.deposit"), value: money(lease.depositAmount) },
            { key: "advance", label: t("terms.advance"), value: money(lease.advanceRentAmount) },
          ]}
        />
        {lease.lines.length ? (
          <>
            <h3 className="text-muted mt-4 text-sm font-semibold">{t("terms.charges")}</h3>
            <Facts
              items={lease.lines.map((line) => ({
                key: line.id,
                label: line.description,
                value:
                  line.recurrence === "monthly"
                    ? t("terms.perMonth", { amount: money(line.amount) })
                    : t("terms.once", { amount: money(line.amount) }),
              }))}
            />
          </>
        ) : null}
        <h3 className="text-muted mt-4 text-sm font-semibold" id="parties-title">
          {t("parties.title")}
        </h3>
        <ul className="divide-border flex flex-col divide-y" role="list" data-testid="lease-parties">
          {lease.parties.map((party) => (
            <li key={party.partyId} className="flex flex-wrap items-baseline justify-between gap-x-3 py-2.5">
              <span>{party.displayName ?? t("parties.hidden")}</span>
              <span className="text-muted text-sm">
                {t(`parties.role.${party.role}`)}
                {party.isSigner
                  ? ` · ${party.signedAt ? t("parties.signed", { date: date(party.signedAt) }) : t("parties.notSigned")}`
                  : null}
              </span>
            </li>
          ))}
        </ul>
      </PaperDocument>

      {rules.length ? (
        <Section title={t("rules.title")} titleId="rules-title" testId="lease-rules">
          <Card padding="md">
            <ul className="flex flex-col gap-3" role="list">
              {rules.map((clause, index) => (
                <li key={`${clause.type}-${index}`}>
                  <h3 className="font-medium">{clause.title}</h3>
                  <p className="text-muted text-sm">{clause.text}</p>
                </li>
              ))}
            </ul>
            {/* The API offers `acknowledge-rules` while it is due; once done it reports when. */}
            {actions.has("acknowledge-rules") || lease.rulesAcknowledgedAt ? (
              <RulesAcknowledge
                leaseId={lease.id}
                acknowledgedOn={lease.rulesAcknowledgedAt ? date(lease.rulesAcknowledgedAt) : null}
              />
            ) : null}
          </Card>
        </Section>
      ) : null}

      {other.length ? (
        <Section title={t("addendum.title")} titleId="addendum-title">
          <Card padding="md">
            <ul className="flex flex-col gap-3" role="list">
              {other.map((clause, index) => (
                <li key={`${clause.type}-${index}`}>
                  <h3 className="font-medium">{clause.title}</h3>
                  <p className="text-muted text-sm">{clause.text}</p>
                </li>
              ))}
            </ul>
          </Card>
        </Section>
      ) : null}

      {related.length ? (
        <Section title={t("view.more")} titleId="lease-more-title">
          <List rows={related} />
        </Section>
      ) : null}

      {children}

      {actions.has("sign") ? (
        <ActionDock>
          <Button asChild size="xl" block iconStart={IconSign}>
            <Link href={`/lease/${lease.id}/sign`} data-testid="lease-sign">
              {t("view.signCta")}
            </Link>
          </Button>
        </ActionDock>
      ) : null}
    </Screen>
  );
}
