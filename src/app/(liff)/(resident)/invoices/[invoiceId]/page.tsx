import { getTranslations } from "next-intl/server";

import { loadInvoice } from "@/features/resident/invoices/data";
import { InvoiceDetail } from "@/features/resident/invoices/InvoiceDetail";
import { bangkokToday } from "@/features/resident/invoices/model";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { clientEnv } from "@/lib/env";

export async function generateMetadata() {
  const t = await getTranslations("resident.invoices.detail");
  return { title: t("metaTitle") };
}

/**
 * One invoice (L2 2.1 §3) — the page the API's LINE messages open (`/invoices/{id}`, D-011). `?pay=1` (the home
 * hero, the LINE pay button) opens the pay sheet straight away.
 */
export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ invoiceId }, query] = await Promise.all([params, searchParams]);
  const [t, locale, loaded] = await Promise.all([
    getTranslations("resident.invoices.detail"),
    pageLocale(),
    loadInvoice(invoiceId),
  ]);
  return (
    <ResidentShell active="bills">
      <BackLink href="/invoices">{t("back")}</BackLink>
      {loaded.data ? (
        <InvoiceDetail
          invoice={loaded.data}
          locale={locale}
          today={bangkokToday()}
          autoPay={query.pay === "1"}
          vapidKey={clientEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY}
        />
      ) : (
        <ProblemPage error={loaded.error} />
      )}
    </ResidentShell>
  );
}
