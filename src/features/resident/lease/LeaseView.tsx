import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { LEASE_STATUS } from "@/domain/status/lease";
import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { LeaseView as Lease } from "@/lib/api/contract-requests";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { StatusBadge } from "@/ui/components/Badge";
import { IconCalendar } from "@/ui/icons/glyphs/calendar";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconShield } from "@/ui/icons/glyphs/shield";
import { IconSign } from "@/ui/icons/glyphs/sign";

import { ContractButton } from "./ContractButton";
import { RulesAcknowledge } from "./RulesAcknowledge";

/** Clause types that make up the building rules the resident acknowledges (the lease's addendum, D-020). */
const RULE_TYPES = new Set(["house_rules", "pets", "smoking", "guests", "quiet_hours", "parking_rules", "waste"]);

function Row({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-border flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0">
      <dt className="text-muted text-sm">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

/**
 * The lease as the API returns it (B2.3): status, the unit and building, who is on it (lessee, co-residents —
 * names the API withholds stay hidden, D-152), term, rent, deposit and recurring charges, the building rules of its
 * addendum (with their acknowledgement, CONTRACT-REQUEST #8), the notice when one was given, and the actions the
 * API offers (`nextActions`: view the lease document, sign, give notice). Nothing is computed here.
 */
export async function LeaseView({ lease, locale, depositId }: { lease: Lease; locale: Locale; depositId?: string }) {
  const t = await getTranslations("resident.lease");
  const status = await getTranslations();
  const money = (value: string) => formatTHB(value, locale);
  const date = (value: string) => formatDate(value, locale);
  const rules = lease.addendum.filter((clause) => RULE_TYPES.has(clause.type));
  const other = lease.addendum.filter((clause) => !RULE_TYPES.has(clause.type));
  const actions = new Set(lease.nextActions);

  return (
    <div className="flex flex-col gap-4 py-5" data-testid="lease-view">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-display text-2xl font-semibold">{t("view.title", { unit: lease.unitNo })}</h1>
          <StatusBadge status={LEASE_STATUS[lease.status]} label={status(LEASE_STATUS[lease.status].labelKey)} />
        </div>
        <p className="text-muted text-sm">
          {t("view.subtitle", { building: lease.buildingName, operator: lease.tenantName })}
          {lease.number ? ` · ${t("view.number", { number: lease.number })}` : null}
        </p>
      </div>

      {actions.has("sign") ? (
        <Callout
          tone="info"
          title={t("view.signTitle")}
          action={
            <Button asChild size="lg" block iconStart={IconSign}>
              <Link href={`/lease/${lease.id}/sign`} data-testid="lease-sign">
                {t("view.signCta")}
              </Link>
            </Button>
          }
        >
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

      <Card as="section" aria-labelledby="terms-title" padding="md">
        <h2 id="terms-title" className="font-semibold">
          {t("terms.title")}
        </h2>
        <dl className="mt-2">
          <Row label={t("terms.unit")}>{lease.unitNo}</Row>
          <Row label={t("terms.term")}>
            {t("terms.termValue", { start: date(lease.startDate), end: date(lease.endDate), months: lease.months })}
          </Row>
          <Row label={t("terms.rent")}>
            <span className="tabular-nums">{t("terms.perMonth", { amount: money(lease.rent) })}</span>
          </Row>
          <Row label={t("terms.deposit")}>
            <span className="tabular-nums">{money(lease.depositAmount)}</span>
          </Row>
          <Row label={t("terms.advance")}>
            <span className="tabular-nums">{money(lease.advanceRentAmount)}</span>
          </Row>
          <Row label={t("terms.utilities")}>{t(`terms.utilityMode.${lease.utilityBillingMode}`)}</Row>
        </dl>
        {lease.lines.length ? (
          <>
            <h3 className="mt-4 text-sm font-semibold">{t("terms.charges")}</h3>
            <ul className="mt-1 flex flex-col" role="list">
              {lease.lines.map((line) => (
                <li key={line.id} className="border-border flex justify-between gap-4 border-b py-2 last:border-b-0">
                  <span>{line.description}</span>
                  <span className="text-right tabular-nums">
                    {line.recurrence === "monthly"
                      ? t("terms.perMonth", { amount: money(line.amount) })
                      : t("terms.once", { amount: money(line.amount) })}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Card>

      <Card as="section" aria-labelledby="parties-title" padding="md">
        <h2 id="parties-title" className="font-semibold">
          {t("parties.title")}
        </h2>
        <ul className="mt-2 flex flex-col gap-2" role="list" data-testid="lease-parties">
          {lease.parties.map((party) => (
            <li key={party.partyId} className="flex flex-wrap items-baseline justify-between gap-2">
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
      </Card>

      {actions.has("view-contract") ? (
        <ContractButton leaseId={lease.id} signed={lease.status !== "pending_signature"} />
      ) : null}

      {rules.length ? (
        <Card as="section" aria-labelledby="rules-title" padding="md" data-testid="lease-rules">
          <h2 id="rules-title" className="flex items-center gap-2 font-semibold">
            {t("rules.title")}
          </h2>
          <ul className="mt-2 flex flex-col gap-3" role="list">
            {rules.map((clause, index) => (
              <li key={`${clause.type}-${index}`}>
                <h3 className="text-sm font-semibold">{clause.title}</h3>
                <p className="text-muted text-sm">{clause.text}</p>
              </li>
            ))}
          </ul>
          {/* CONTRACT-REQUEST #8: only when the API reports the acknowledgement state. */}
          {lease.rulesAcknowledgedAt !== undefined && lease.status !== "pending_signature" ? (
            <RulesAcknowledge
              leaseId={lease.id}
              acknowledgedOn={lease.rulesAcknowledgedAt ? date(lease.rulesAcknowledgedAt) : null}
            />
          ) : null}
        </Card>
      ) : null}

      {other.length ? (
        <Card as="section" aria-labelledby="addendum-title" padding="md">
          <h2 id="addendum-title" className="font-semibold">
            {t("addendum.title")}
          </h2>
          <ul className="mt-2 flex flex-col gap-3" role="list">
            {other.map((clause, index) => (
              <li key={`${clause.type}-${index}`}>
                <h3 className="text-sm font-semibold">{clause.title}</h3>
                <p className="text-muted text-sm">{clause.text}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="flex flex-col gap-2">
        {actions.has("give-notice") ? (
          <Button asChild variant="secondary" size="lg" block iconStart={IconCalendar}>
            <Link href={`/lease/${lease.id}/notice`} data-testid="lease-notice">
              {t("view.noticeCta")}
            </Link>
          </Button>
        ) : null}
        {depositId ? (
          <Button asChild variant="secondary" size="lg" block iconStart={IconShield} iconEnd={IconForward}>
            <Link href={`/deposit/${depositId}`} data-testid="lease-deposit">
              {t("view.depositCta")}
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
