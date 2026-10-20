import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { pageLocale } from "@/features/resident/lease/data";
import { loadCategories } from "@/features/resident/requests/data";
import { categoryName } from "@/features/resident/requests/model";
import { NewRequestForm } from "@/features/resident/requests/NewRequestForm";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";
import { Callout } from "@/ui/components/Callout";

export async function generateMetadata() {
  const t = await getTranslations("resident.requests.new");
  return { title: t("title") };
}

/**
 * Report a problem (L4 4.1 §1) for the selected unit — or `?unit=` when the resident picked another of theirs in the
 * form; the categories are that unit's landlord's (`GET /v1/resident/service-categories?unitId=`).
 */
export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, locale, params, t, list, cat] = await Promise.all([
    getActor(),
    pageLocale(),
    searchParams,
    getTranslations("resident.requests.new"),
    getTranslations("resident.requests.list"),
    getTranslations("resident.requests.category"),
  ]);
  if (actor.status !== "signed-in") return null;
  if (!actor.entitlements.has("service_requests") || !actor.unit) notFound();
  const wanted = typeof params.unit === "string" ? params.unit : undefined;
  const unit = actor.me.units.find((u) => u.unitId === wanted) ?? actor.unit;
  const categories = await loadCategories(unit.unitId);
  return (
    <ResidentShell active="requests">
      <BackLink href="/requests">{list("title")}</BackLink>
      <div className="flex flex-col gap-4 pb-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted">{t("lead")}</p>
        </div>
        {categories.error ? (
          <ProblemPage error={categories.error} />
        ) : categories.data.length === 0 ? (
          <Callout tone="info">{t("noCategories")}</Callout>
        ) : (
          <NewRequestForm
            unitId={unit.unitId}
            units={actor.me.units.map((u) => ({ value: u.unitId, label: `${u.unitNo} · ${u.buildingName}` }))}
            categories={categories.data.map((c) => ({
              value: c.id,
              label: categoryName(c, locale, (key) => cat(key)),
            }))}
          />
        )}
      </div>
    </ResidentShell>
  );
}
