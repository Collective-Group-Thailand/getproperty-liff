import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { loadUnlockLog } from "@/features/resident/access/data";
import { MyCodes } from "@/features/resident/access/MyCodes";
import { UnlockLog } from "@/features/resident/access/UnlockLog";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.access");
  return { title: t("title") };
}

/**
 * Door codes and my unit's unlock log (L4 4.2 §3, C1; D-070, D-071). Codes follow the lease (`lease` entitlement;
 * no `access` entitlement in the contract yet — CONTRACT-REQUEST #27); they are fetched only on request (each reveal
 * is audited). The log is read on the server for the selected unit only.
 */
export default async function AccessPage() {
  const [actor, locale, t] = await Promise.all([getActor(), pageLocale(), getTranslations("resident.access")]);
  if (actor.status !== "signed-in") return null;
  if (!actor.entitlements.has("lease") || !actor.unit) notFound();
  const log = await loadUnlockLog(actor.unit.unitId);
  return (
    <ResidentShell active={null}>
      <div className="flex flex-col gap-4 py-5" data-testid="access">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted">{t("lead")}</p>
        </div>
        <MyCodes unitId={actor.unit.unitId} />
        {log.error ? (
          <ProblemPage error={log.error} />
        ) : (
          <UnlockLog events={log.data} unitNo={actor.unit.unitNo} locale={locale} />
        )}
      </div>
    </ResidentShell>
  );
}
