import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PayLauncher } from "@/features/resident/pay/PayLauncher";
import { Screen, ScreenHeader, Section } from "@/features/shared/Screen";
import { MANDATE_STATUS, PAYMENT_PLAN_STATUS } from "@/domain/status/juristic";
import { formatPeriodKey, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { BudgetActual, PaymentMandate, PaymentPlan, Statement } from "@/lib/api/types";
import { primaryRole, type MyUnit } from "@/lib/auth/units";
import { Badge, StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { EmptyState } from "@/ui/components/EmptyState";
import { Icon, type IconGlyph } from "@/ui/icons";
import { IconBill } from "@/ui/icons/glyphs/bill";
import { IconCalendar } from "@/ui/icons/glyphs/calendar";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconChevronRight } from "@/ui/icons/glyphs/chevron-right";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconLease } from "@/ui/icons/glyphs/lease";
import { IconReceipt } from "@/ui/icons/glyphs/receipt";
import { IconShield } from "@/ui/icons/glyphs/shield";

import { AutoPayLink } from "./AutoPayLink";
import { BudgetCard } from "./BudgetCard";
import { DocumentControl } from "./DocumentControl";
import { FeePaper, type PaperUnit } from "./FeePaper";
import { canRequestClearance, kindWords, measuresOf, type FeeStatement } from "./model";
import { periodName } from "./words";

export interface FeesScreenProps {
  statements: FeeStatement[];
  /** My units with bills (the paper's places). */
  units: MyUnit[];
  /** The unit on screen (the switcher): its plan, auto-pay, certificate and budget. */
  unit: MyUnit;
  budget: BudgetActual | null;
  mandates: PaymentMandate[] | null;
  plan: PaymentPlan | undefined;
  latestStatement: Statement | null;
  /** The newest receipt of a paid fee invoice (the "download" row). */
  latestReceipt: { id: string; number: string; period: FeeStatement["period"] } | null;
  today: string;
  locale: Locale;
  vapidKey?: string;
}

/**
 * `/fees` "ค่าส่วนกลางของฉัน" (JL1; J-DESIGN §3 *liff-common-fees*). Money first, calmly: the open period as paper
 * across my units, then its one filled action (scan to pay with PromptPay, the existing pay flow), the outlined slip
 * and a quiet auto-pay link; the building's budget; the documents (statements, receipts, payment plan, debt clearance).
 * Firm, never shaming (§1.2): "ยอดที่ต้องชำระ", "เลยกำหนดมา n วัน" — never ลูกหนี้.
 */
export async function FeesScreen({
  statements,
  units,
  unit,
  budget,
  mandates,
  plan,
  latestStatement,
  latestReceipt,
  today,
  locale,
  vapidKey,
}: FeesScreenProps) {
  const t = await getTranslations("resident.fees");
  const roles = await getTranslations("shell.unitSwitcher.role");
  const status = await getTranslations();
  const places = new Map<string, PaperUnit>(
    units.map((u) => [u.unitId, { kind: u.propertyKind, measures: measuresOf(u) }]),
  );
  const open = statements.filter((s) => s.open);
  const shown = open.length ? open : statements.slice(0, 1);
  const lead = shown[0];
  const role = primaryRole(unit);
  const words = kindWords(unit.propertyKind);
  const unitName = t(`kind.unit.${words.unit}`, { unit: unit.unitNo });
  const live = mandates?.find((m) => m.state === "active" || m.state === "pending");
  const several = units.length > 1;

  return (
    <Screen testId="fees">
      <ScreenHeader
        title={t("title")}
        lede={
          lead
            ? [periodName(t, lead.period, locale), role ? roles(role) : null].filter(Boolean).join(" · ")
            : role
              ? roles(role)
              : undefined
        }
        status={
          lead ? (
            lead.open ? (
              <Badge tone="neutral" icon={IconClock}>
                {t("state.open")}
              </Badge>
            ) : (
              <Badge tone="success" icon={IconCheckCircle}>
                {t("state.paid")}
              </Badge>
            )
          ) : undefined
        }
      />

      {lead ? (
        shown.map((statement, index) => (
          <section
            key={statement.period.key}
            className="flex flex-col gap-3"
            aria-label={periodName(t, statement.period, locale)}
          >
            <FeePaper
              statement={statement}
              units={places}
              locale={locale}
              today={today}
              headingId={`fee-paper-${index}`}
              testId={index === 0 ? "fee-paper" : "fee-paper-more"}
            />
            {statement.open && statement.payFirst ? (
              <div className="flex flex-col gap-2" data-testid={index === 0 ? "fees-actions" : undefined}>
                {statement.units.length > 1 ? (
                  <p className="text-muted text-sm" data-testid="fees-pay-first">
                    {t("payFirst", { unit: statement.payFirst.unitNo ?? "" })}
                  </p>
                ) : null}
                <PayLauncher
                  invoice={statement.payFirst}
                  label={t("pay")}
                  variant={index === 0 ? "primary" : "secondary"}
                  size={index === 0 ? "xl" : "lg"}
                  testId={index === 0 ? "fees-pay" : "fees-pay-more"}
                  slipLabel={index === 0 ? t("slip") : undefined}
                  slipTestId="fees-slip"
                  vapidKey={vapidKey}
                />
                {index === 0 ? (
                  live ? (
                    <Link
                      href={`/units/${unit.unitId}/auto-pay`}
                      className="text-muted mx-auto inline-flex min-h-11 items-center gap-1.5 px-2 text-sm"
                      data-testid="fees-autopay-on"
                    >
                      {status(MANDATE_STATUS[live.state].labelKey)}
                      {live.masked ? <span className="font-mono">{live.masked}</span> : null}
                      <Icon icon={IconChevronRight} className="rtl:rotate-180" />
                    </Link>
                  ) : mandates && unit.recurringAvailable ? (
                    <AutoPayLink unitId={unit.unitId} label={t("autopayLink")} />
                  ) : null
                ) : null}
              </div>
            ) : null}
          </section>
        ))
      ) : (
        <EmptyState
          variant="card"
          icon={IconBill}
          title={t("empty.title")}
          description={t("empty.body")}
          action={
            <Button asChild variant="secondary">
              <Link href="/invoices">{t("documents.allBills")}</Link>
            </Button>
          }
        />
      )}

      {budget ? <BudgetCard budget={budget} locale={locale} /> : null}

      <Section
        title={several ? t("documents.titleFor", { unit: unitName }) : t("documents.title")}
        titleId="fees-documents-title"
        testId="fees-documents"
      >
        <ul className="rounded-card border-border bg-surface shadow-card divide-border divide-y border">
          {latestReceipt ? (
            <DocRow
              icon={IconReceipt}
              title={t("documents.receipt", { period: periodName(t, latestReceipt.period, locale) })}
              meta={t("documents.receiptBody", { number: latestReceipt.number })}
              end={
                <DocumentControl
                  compact
                  target={{ kind: "receipt", id: latestReceipt.id }}
                  label={t("documents.download")}
                  testId="fees-receipt-download"
                />
              }
            />
          ) : null}
          <DocRow
            href="/statements"
            icon={IconBill}
            title={t("documents.statements")}
            meta={
              latestStatement
                ? t("documents.statementsBody", {
                    month: formatPeriodKey(latestStatement.period, locale),
                    amount: formatTHB(latestStatement.amountDue, locale),
                  })
                : t("documents.statementsNone")
            }
            testId="fees-statements"
          />
          <DocRow
            href={`/units/${unit.unitId}/payment-plans`}
            icon={IconCalendar}
            title={t("documents.plan")}
            meta={plan ? undefined : t("documents.planBody")}
            badge={
              plan ? (
                <StatusBadge
                  status={PAYMENT_PLAN_STATUS[plan.state]}
                  label={status(PAYMENT_PLAN_STATUS[plan.state].labelKey)}
                  size="sm"
                />
              ) : undefined
            }
            testId="fees-plan"
          />
          {canRequestClearance(unit) ? (
            <DocRow
              icon={IconShield}
              title={t("documents.clearance")}
              meta={t("documents.clearanceBody")}
              end={
                <Link
                  href={`/units/${unit.unitId}/debt-clearances`}
                  className="border-border-strong rounded-control bg-surface active:bg-bg-subtle inline-flex h-9 shrink-0 items-center border px-3 text-sm font-medium"
                  data-testid="fees-clearance"
                >
                  {t("documents.clearanceAction")}
                </Link>
              }
            />
          ) : null}
          <DocRow
            href="/invoices"
            icon={IconLease}
            title={t("documents.allBills")}
            meta={t("documents.allBillsBody")}
          />
        </ul>
      </Section>
    </Screen>
  );
}

function DocRow({
  href,
  icon,
  title,
  meta,
  end,
  badge,
  testId,
}: {
  href?: string;
  icon: IconGlyph;
  title: React.ReactNode;
  meta?: React.ReactNode;
  end?: React.ReactNode;
  badge?: React.ReactNode;
  testId?: string;
}) {
  const body = (
    <>
      <span
        className="bg-bg-subtle rounded-thumb text-muted grid size-9 shrink-0 place-items-center text-lg"
        aria-hidden="true"
      >
        <Icon icon={icon} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-medium break-words">{title}</span>
        {meta ? <span className="text-muted text-sm">{meta}</span> : null}
        {badge ? <span>{badge}</span> : null}
      </span>
    </>
  );
  return (
    <li>
      {href && !end ? (
        <Link
          href={href}
          className="active:bg-bg-subtle flex min-h-16 items-center gap-3 px-4 py-3"
          data-testid={testId}
        >
          {body}
          <Icon icon={IconChevronRight} className="text-subtle -me-1 shrink-0 rtl:rotate-180" />
        </Link>
      ) : (
        <div className="flex min-h-16 items-center gap-3 px-4 py-3" data-testid={end ? undefined : testId}>
          {body}
          {end}
        </div>
      )}
    </li>
  );
}
