import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { loadBudget, loadFeeInvoices, loadMandates, loadPlans, loadStatementPage } from "@/features/resident/fees/data";
import { FeesScreen } from "@/features/resident/fees/FeesScreen";
import { groupStatements, openPlan } from "@/features/resident/fees/model";
import { bangkokToday } from "@/features/resident/invoices/model";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";
import { serverEnv } from "@/lib/env";

export async function generateMetadata() {
  const t = await getTranslations("resident.fees");
  return { title: t("title") };
}

/**
 * `/fees` — my common fees (JL1): every unit billed to me on one paper per period (a debt is never hidden behind the
 * switcher, JRL decision 6); the unit on screen gives the plan, auto-pay, certificate and budget. A unit without bills
 * of mine (a family member's) has no fees page.
 */
export default async function FeesPage() {
  const actor = await getActor();
  if (actor.status !== "signed-in") notFound();
  const billed = actor.units.filter((u) => u.capabilities.includes("invoices"));
  const unit = billed.find((u) => u.unitId === actor.unit?.unitId) ?? billed[0];
  if (!unit) notFound();
  const [locale, invoices, budget, mandates, plans, statements] = await Promise.all([
    pageLocale(),
    loadFeeInvoices(),
    loadBudget(unit.unitId),
    loadMandates(unit.unitId),
    loadPlans(unit.unitId),
    loadStatementPage(1),
  ]);
  if (invoices.error) {
    return (
      <ResidentShell active="bills">
        <ProblemPage error={invoices.error} />
      </ResidentShell>
    );
  }
  const grouped = groupStatements(invoices.data);
  // The newest receipt of a settled period of the unit on screen (the documents row "download").
  const settled = grouped.find(
    (s) => !s.open && s.units.some((u) => u.unitId === unit.unitId && u.invoice.receipts.length),
  );
  const receipt = settled?.units.find((u) => u.unitId === unit.unitId)?.invoice.receipts[0];
  return (
    <ResidentShell active="bills">
      <FeesScreen
        statements={grouped}
        units={billed}
        unit={unit}
        // A budget, mandates or plans that could not be read leave their part out rather than fail the page.
        budget={budget.data ?? null}
        mandates={mandates.data ?? null}
        plan={plans.data ? openPlan(plans.data) : undefined}
        latestStatement={statements.data?.items[0] ?? null}
        latestReceipt={receipt && settled ? { id: receipt.id, number: receipt.number, period: settled.period } : null}
        today={bangkokToday()}
        locale={locale}
        vapidKey={serverEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY}
      />
    </ResidentShell>
  );
}
