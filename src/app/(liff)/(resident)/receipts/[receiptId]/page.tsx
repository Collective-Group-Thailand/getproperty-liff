import { getTranslations } from "next-intl/server";

import { loadReceipt } from "@/features/resident/invoices/data";
import { pageLocale } from "@/features/resident/lease/data";
import { ReceiptDetail } from "@/features/resident/receipts/Receipts";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";

export async function generateMetadata() {
  const t = await getTranslations("resident.receipts");
  return { title: t("title") };
}

/** One receipt — the page the API's LINE receipt message opens (`/receipts/{id}`, D-044). */
export default async function ReceiptPage({ params }: { params: Promise<{ receiptId: string }> }) {
  const { receiptId } = await params;
  const [t, locale, loaded] = await Promise.all([
    getTranslations("resident.receipts"),
    pageLocale(),
    loadReceipt(receiptId),
  ]);
  return (
    <ResidentShell active="bills">
      <BackLink href="/receipts">{t("title")}</BackLink>
      {loaded.data ? <ReceiptDetail receipt={loaded.data} locale={locale} /> : <ProblemPage error={loaded.error} />}
    </ResidentShell>
  );
}
