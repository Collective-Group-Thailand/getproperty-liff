import { getTranslations } from "next-intl/server";

import { pageLocale } from "@/features/resident/lease/data";
import { loadRequest } from "@/features/resident/requests/data";
import { RequestDetail } from "@/features/resident/requests/RequestDetail";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { Callout } from "@/ui/components/Callout";

export async function generateMetadata({ params }: { params: Promise<{ requestId: string }> }) {
  const [t, { requestId }] = await Promise.all([getTranslations("resident.requests.list"), params]);
  return { title: `${t("title")} · ${requestId.slice(0, 8)}` };
}

/** One repair request (L4 4.1 §2) — also the target of the API's LINE messages about it (`/requests/{id}`). */
export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ requestId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ requestId }, query, locale, t] = await Promise.all([
    params,
    searchParams,
    pageLocale(),
    getTranslations("resident.requests"),
  ]);
  const loaded = await loadRequest(requestId);
  return (
    <ResidentShell active="requests">
      <BackLink href="/requests">{t("detail.back")}</BackLink>
      {loaded.error ? (
        <ProblemPage error={loaded.error} />
      ) : (
        <>
          {query.sent === "1" ? (
            <div role="status" data-testid="request-sent">
              <Callout tone="success">{t("new.sent", { ref: loaded.data.ref })}</Callout>
            </div>
          ) : null}
          <RequestDetail request={loaded.data} locale={locale} />
        </>
      )}
    </ResidentShell>
  );
}
