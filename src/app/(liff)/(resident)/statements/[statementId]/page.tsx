import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { loadStatement } from "@/features/resident/fees/data";
import { StatementPaper } from "@/features/resident/fees/Statements";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";

export async function generateMetadata() {
  const t = await getTranslations("resident.fees.statements");
  return { title: t("title") };
}

/** One monthly statement — the page `juristic.statement.ready` opens in LINE (`/statements/{id}`, JL1). */
export default async function StatementPage({ params }: { params: Promise<{ statementId: string }> }) {
  const { statementId } = await params;
  const [t, locale, loaded] = await Promise.all([
    getTranslations("resident.fees.statements"),
    pageLocale(),
    loadStatement(statementId),
  ]);
  if (loaded.data === null) notFound();
  return (
    <ResidentShell active="bills" back={{ href: "/statements", label: t("title") }}>
      {loaded.error ? <ProblemPage error={loaded.error} /> : <StatementPaper statement={loaded.data} locale={locale} />}
    </ResidentShell>
  );
}
