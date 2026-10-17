import { getTranslations } from "next-intl/server";

import { loadReceiptPage } from "@/features/resident/invoices/data";
import { pageLocale } from "@/features/resident/lease/data";
import { ReceiptList } from "@/features/resident/receipts/Receipts";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";

export async function generateMetadata() {
  const t = await getTranslations("resident.receipts");
  return { title: t("title") };
}

/** My receipts (L2 2.2 §3, D-044). */
export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).page;
  const parsed = Number(Array.isArray(raw) ? raw[0] : raw);
  const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  const [t, locale, loaded] = await Promise.all([
    getTranslations("resident.invoices.list"),
    pageLocale(),
    loadReceiptPage(page),
  ]);
  return (
    <ResidentShell active="bills">
      <BackLink href="/invoices">{t("title")}</BackLink>
      {loaded.data ? (
        <ReceiptList items={loaded.data.items} meta={loaded.data.meta} page={page} locale={locale} />
      ) : (
        <ProblemPage error={loaded.error} />
      )}
    </ResidentShell>
  );
}
