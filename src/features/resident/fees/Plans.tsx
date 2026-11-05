import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { INSTALMENT_STATUS, PAYMENT_PLAN_STATUS } from "@/domain/status/juristic";
import { List, PaperDocument, Screen, ScreenHeader, Section } from "@/features/shared/Screen";
import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { PaymentPlan } from "@/lib/api/types";
import { StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { IconAdd } from "@/ui/icons/glyphs/add";
import { IconCalendar } from "@/ui/icons/glyphs/calendar";

import { nextInstalment, openPlan } from "./model";
import { WithdrawPlan } from "./WithdrawPlan";

/**
 * Payment plans of one unit (D-325): the plan that is open (one at a time) with its next instalment, then the earlier
 * ones. Without an open plan, one card explains what a plan is and offers the request — the screen's one filled action.
 */
export async function PlanList({
  unitId,
  unitName,
  plans,
  locale,
}: {
  unitId: string;
  unitName: string;
  plans: PaymentPlan[];
  locale: Locale;
}) {
  const t = await getTranslations("resident.fees.plans");
  const status = await getTranslations();
  const current = openPlan(plans);
  const next = current ? nextInstalment(current) : undefined;
  const earlier = plans.filter((plan) => plan !== current);
  return (
    <Screen testId="plan-list">
      <ScreenHeader title={t("title")} lede={unitName} flush />
      {current ? (
        <Card as="section" aria-labelledby="plan-current-title" padding="lg" data-testid="plan-current">
          <div className="flex items-start justify-between gap-3">
            <h2 id="plan-current-title" className="font-semibold">
              {t("instalments", { count: current.instalmentCount })}
            </h2>
            <StatusBadge
              status={PAYMENT_PLAN_STATUS[current.state]}
              label={status(PAYMENT_PLAN_STATUS[current.state].labelKey)}
            />
          </div>
          <p className="text-muted mt-1 text-sm">
            {current.state === "proposed"
              ? t("waiting")
              : t("principal", { amount: formatTHB(current.principal ?? current.proposedPrincipal, locale) })}
          </p>
          {next ? (
            <p className="mt-3 text-sm" data-testid="plan-next">
              {t("next", {
                seq: next.seq,
                date: formatDate(next.dueOn, locale),
                amount: formatTHB(next.amount, locale),
              })}
            </p>
          ) : null}
          <Button asChild variant="secondary" size="lg" block className="mt-4">
            <Link href={`/units/${unitId}/payment-plans/${current.id}`} data-testid="plan-open">
              {t("view")}
            </Link>
          </Button>
        </Card>
      ) : (
        <Card as="section" aria-labelledby="plan-ask-title" padding="lg" data-testid="plan-ask">
          <h2 id="plan-ask-title" className="font-semibold">
            {t("askTitle")}
          </h2>
          <p className="text-muted mt-1 text-sm">{t("askBody")}</p>
          <Button asChild size="xl" block className="mt-4" iconStart={IconAdd}>
            <Link href={`/units/${unitId}/payment-plans/new`} data-testid="plan-request">
              {t("ask")}
            </Link>
          </Button>
        </Card>
      )}
      {earlier.length ? (
        <Section title={t("earlier")} titleId="plan-earlier-title">
          <List
            rows={earlier.map((plan) => ({
              key: plan.id,
              href: `/units/${unitId}/payment-plans/${plan.id}`,
              icon: IconCalendar,
              title: t("instalments", { count: plan.instalmentCount }),
              meta: t("requestedOn", { date: formatDate(plan.createdAt, locale) }),
              endMeta: (
                <StatusBadge
                  size="sm"
                  status={PAYMENT_PLAN_STATUS[plan.state]}
                  label={status(PAYMENT_PLAN_STATUS[plan.state].labelKey)}
                />
              ),
              testId: "plan-row",
            }))}
          />
        </Section>
      ) : null}
    </Screen>
  );
}

/**
 * One plan as a record (D-325): its state, the amount it splits (proposed, or as approved), every instalment with its
 * due date, amount and state, the office's reason when it decided; *withdraw* while the API offers it (`nextActions`).
 */
export async function PlanRecord({
  unitId,
  unitName,
  plan,
  locale,
  sent,
}: {
  unitId: string;
  unitName: string;
  plan: PaymentPlan;
  locale: Locale;
  sent: boolean;
}) {
  const t = await getTranslations("resident.fees.plans");
  const status = await getTranslations();
  const next = nextInstalment(plan);
  return (
    <Screen testId="plan-record" data-state={plan.state}>
      <ScreenHeader
        title={t("instalments", { count: plan.instalmentCount })}
        lede={unitName}
        flush
        status={
          <span data-testid="plan-state" data-state={plan.state}>
            <StatusBadge
              status={PAYMENT_PLAN_STATUS[plan.state]}
              label={status(PAYMENT_PLAN_STATUS[plan.state].labelKey)}
            />
          </span>
        }
      />
      {sent && plan.state === "proposed" ? (
        <Callout tone="success" title={t("sentTitle")}>
          {t("sentBody")}
        </Callout>
      ) : null}
      {plan.state === "rejected" || plan.state === "defaulted" ? (
        <Callout tone={plan.state === "defaulted" ? "warning" : "info"} title={t(`decided.${plan.state}`)}>
          {plan.decidedReason ?? t(`decided.${plan.state}Body`)}
        </Callout>
      ) : null}
      <PaperDocument
        labelledBy="plan-title"
        kind={t("paperTitle")}
        testId="plan-paper"
        facts={[
          {
            key: "principal",
            label: plan.principal ? t("approvedPrincipal") : t("proposedPrincipal"),
            value: formatTHB(plan.principal ?? plan.proposedPrincipal, locale),
          },
          { key: "first", label: t("firstDue"), value: formatDate(plan.firstDueOn, locale) },
          { key: "requested", label: t("requested"), value: formatDate(plan.createdAt, locale) },
          ...(plan.approvedAt
            ? [{ key: "approved", label: t("approved"), value: formatDate(plan.approvedAt, locale) }]
            : []),
        ]}
      >
        <table className="w-full border-collapse text-sm" data-testid="plan-instalments">
          <caption className="sr-only">{t("table")}</caption>
          <thead>
            <tr className="border-border text-muted border-b text-start">
              <th scope="col" className="py-2 pe-2 text-start font-medium">
                {t("seq")}
              </th>
              <th scope="col" className="py-2 pe-2 text-start font-medium">
                {t("dueOn")}
              </th>
              <th scope="col" className="py-2 text-end font-medium">
                {t("amount")}
              </th>
            </tr>
          </thead>
          <tbody>
            {[...plan.instalments]
              .sort((a, b) => a.seq - b.seq)
              .map((instalment) => (
                <tr
                  key={instalment.seq}
                  className="border-border border-b last:border-b-0"
                  data-testid="plan-instalment"
                  data-state={instalment.state}
                  aria-current={next?.seq === instalment.seq ? "step" : undefined}
                >
                  <td className="py-3 pe-2 align-top tabular-nums">{instalment.seq}</td>
                  <td className="py-3 pe-2 align-top">
                    <span className="block tabular-nums">{formatDate(instalment.dueOn, locale)}</span>
                    <span className="mt-1 block">
                      <StatusBadge
                        size="sm"
                        status={INSTALMENT_STATUS[instalment.state]}
                        label={status(INSTALMENT_STATUS[instalment.state].labelKey)}
                      />
                    </span>
                  </td>
                  <td
                    className={`py-3 text-end align-top tabular-nums ${next?.seq === instalment.seq ? "font-semibold" : ""}`}
                  >
                    {formatTHB(instalment.amount, locale)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {plan.state === "proposed" ? <p className="text-muted mt-3 text-sm">{t("proposedNote")}</p> : null}
        {plan.note ? <p className="mt-3 text-sm">{t("note", { note: plan.note })}</p> : null}
      </PaperDocument>
      {plan.nextActions.includes("withdraw") ? (
        <WithdrawPlan unitId={unitId} planId={plan.id} />
      ) : (
        <Button asChild variant="secondary" size="lg" block>
          <Link href="/fees">{t("toFees")}</Link>
        </Button>
      )}
    </Screen>
  );
}
