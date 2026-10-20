import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { pageLocale } from "@/features/resident/lease/data";
import { loadRequests } from "@/features/resident/requests/data";
import { RequestList } from "@/features/resident/requests/RequestList";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getActor } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("resident.requests.list");
  return { title: t("title") };
}

function pageOf(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** My repair requests (L4 4.1, D-072) — only where the landlord has the module (`service_requests`). */
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [actor, locale, params] = await Promise.all([getActor(), pageLocale(), searchParams]);
  if (actor.status !== "signed-in") return null;
  if (!actor.entitlements.has("service_requests")) notFound();
  const page = pageOf(params.page);
  const loaded = await loadRequests(page);
  return (
    <ResidentShell active="requests">
      {loaded.error ? (
        <ProblemPage error={loaded.error} />
      ) : (
        <RequestList requests={loaded.data.items} meta={loaded.data.meta} page={page} locale={locale} />
      )}
    </ResidentShell>
  );
}
