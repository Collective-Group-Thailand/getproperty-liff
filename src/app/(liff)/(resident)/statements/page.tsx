import { getTranslations } from "next-intl/server";

import { loadStatementPage } from "@/features/resident/fees/data";
import { StatementList } from "@/features/resident/fees/Statements";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";

export async function generateMetadata() {
  const t = await getTranslations("resident.fees.statements");
  return { title: t("title") };
}

function pageOf(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** `/statements` — my monthly statements across units (JL1, D-307). */
export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const page = pageOf((await searchParams).page);
  const [t, locale, loaded] = await Promise.all([
    getTranslations("resident.fees"),
    pageLocale(),
    loadStatementPage(page),
  ]);
  return (
    <ResidentShell active="bills" back={{ href: "/fees", label: t("title") }}>
      {loaded.data ? (
        <StatementList items={loaded.data.items} meta={loaded.data.meta} page={page} locale={locale} />
      ) : (
        <ProblemPage error={loaded.error} />
      )}
    </ResidentShell>
  );
}
