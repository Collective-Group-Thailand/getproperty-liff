import { getTranslations } from "next-intl/server";

import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { SosStatus } from "@/features/resident/sos/SosStatus";
import { loadIncident } from "@/features/resident/visitors/data";
import { ProblemPage } from "@/features/shared/ProblemNotice";

export async function generateMetadata() {
  const t = await getTranslations("resident.visitors.sos");
  return { title: t("title") };
}

/** `/sos/{incidentId}` — my emergency after sending, and the LINE message "รปภ. รับเรื่องแล้ว" (JL4, D-317, D-328). */
export default async function SosPage({
  params,
  searchParams,
}: {
  params: Promise<{ incidentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ incidentId }, query] = await Promise.all([params, searchParams]);
  const [locale, loaded] = await Promise.all([pageLocale(), loadIncident(incidentId)]);
  return (
    <ResidentShell active="visitors">
      {loaded.error ? (
        <ProblemPage error={loaded.error} />
      ) : (
        <SosStatus incident={loaded.data} existing={query.existing === "1"} locale={locale} />
      )}
    </ResidentShell>
  );
}
