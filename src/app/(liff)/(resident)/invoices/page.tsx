import { getTranslations } from "next-intl/server";

import { loadInvoicePage, loadOpenInvoices } from "@/features/resident/invoices/data";
import { InvoiceList } from "@/features/resident/invoices/InvoiceList";
import { bangkokToday, openFirst } from "@/features/resident/invoices/model";
import { pageLocale, type Loaded } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import type { InvoiceView } from "@/lib/api/types";
import { getActor } from "@/lib/auth/actor";
import { serverEnv } from "@/lib/env";

export async function generateMetadata() {
  const t = await getTranslations("resident.invoices.list");
  return { title: t("title") };
}

function pageOf(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** My invoices (L2 2.1 §2): open first, then history by billing period. */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const page = pageOf((await searchParams).page);
  const [locale, actor, open, history] = await Promise.all([
    pageLocale(),
    getActor(),
    page === 1 ? loadOpenInvoices() : Promise.resolve<Loaded<InvoiceView[]>>({ data: [] }),
    loadInvoicePage(page),
  ]);
  const showUnit = actor.status === "signed-in" && actor.me.units.length > 1;
  return (
    <ResidentShell active="bills">
      {open.error || history.error ? (
        <ProblemPage error={(open.error ?? history.error)!} />
      ) : (
        <InvoiceList
          open={openFirst(open.data!).open}
          history={history.data!.items}
          meta={history.data!.meta}
          page={page}
          locale={locale}
          today={bangkokToday()}
          showUnit={showUnit}
          vapidKey={serverEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY}
        />
      )}
    </ResidentShell>
  );
}
