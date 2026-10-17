import { getTranslations } from "next-intl/server";

import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { parseRange, usageWindow } from "@/features/resident/usage/range";
import { ManualReadings, UsageView, type UsageWithSummary } from "@/features/resident/usage/UsageView";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.usage");
  return { title: t("title") };
}

const IN_FORCE = new Set(["active", "notice_given", "ending"]);

/**
 * Electricity and water use of the selected unit (D-063, D-162): the lease in force on that unit is the one the
 * usage endpoint is keyed by. Without IoT meters (`usage` not among the entitlements) the screen explains that
 * the meters are read by hand.
 */
export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, locale, params] = await Promise.all([getActor(), pageLocale(), searchParams]);
  if (actor.status !== "signed-in") return null;
  const unit = actor.unit;
  const lease =
    actor.me.leases.find(
      (l) => unit && l.unitNo === unit.unitNo && l.tenantId === unit.tenantId && IN_FORCE.has(l.status),
    ) ?? actor.me.leases.find((l) => IN_FORCE.has(l.status));
  if (!actor.entitlements.has("usage") || !lease) {
    return (
      <ResidentShell active="usage">
        <ManualReadings />
      </ResidentShell>
    );
  }
  const range = parseRange(params.range);
  const window = usageWindow(range);
  const api = await serverApi();
  const get = (from: string, to: string) =>
    api.GET("/v1/resident/leases/{leaseId}/usage", {
      params: { path: { leaseId: lease.leaseId }, query: { from, to, bucket: window.bucket } },
    });
  const [current, previous] = await Promise.all([
    get(window.current.from, window.current.to),
    get(window.previous.from, window.previous.to),
  ]);
  return (
    <ResidentShell active="usage">
      {current.data ? (
        <UsageView
          range={range}
          window={window}
          current={current.data as UsageWithSummary}
          previous={previous.data ?? null}
          locale={locale}
        />
      ) : (
        <ProblemPage error={problemFromParsed(current.response, current.error)} />
      )}
    </ResidentShell>
  );
}
