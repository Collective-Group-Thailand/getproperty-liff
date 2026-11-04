import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { parseRange, usageWindow } from "@/features/resident/usage/range";
import { ManualReadings, UsageView } from "@/features/resident/usage/UsageView";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.usage");
  return { title: t("title") };
}

/**
 * Electricity and water use of the unit on screen (D-063, D-162) — JR (D-322): by unit, for anyone who lives there,
 * lease or not (`/v1/resident/units/{unitId}/usage`). A unit I own without living there has no usage (the occupant's
 * consumption is their personal data): not found. Without IoT meters (`usage` not among the entitlements) the screen
 * explains that the meters are read by hand.
 */
export default async function UsagePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, locale, params] = await Promise.all([getActor(), pageLocale(), searchParams]);
  if (actor.status !== "signed-in") return null;
  const unit = actor.unit;
  if (!unit || !actor.capabilities.has("usage")) notFound();
  if (!actor.entitlements.has("usage")) {
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
    api.GET("/v1/resident/units/{unitId}/usage", {
      params: { path: { unitId: unit.unitId }, query: { from, to, bucket: window.bucket } },
    });
  const [current, previous] = await Promise.all([
    get(window.current.from, window.current.to),
    get(window.previous.from, window.previous.to),
  ]);
  if (current.response.status === 404) notFound();
  return (
    <ResidentShell active="usage">
      {current.data ? (
        <UsageView
          range={range}
          window={window}
          current={current.data}
          previous={previous.data ?? null}
          locale={locale}
        />
      ) : (
        <ProblemPage error={problemFromParsed(current.response, current.error)} />
      )}
    </ResidentShell>
  );
}
