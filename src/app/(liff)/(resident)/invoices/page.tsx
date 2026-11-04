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

/**
 * My invoices (L2 2.1 §2): open first, then history by billing period. JRL: `?unit=` narrows to one of my units with
 * bills (the API's `unitId`); an id that is not one of them is ignored (all units).
 */
export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const page = pageOf(params.page);
  const actor = await getActor();
  const billed = actor.status === "signed-in" ? actor.units.filter((u) => u.capabilities.includes("invoices")) : [];
  const wanted = typeof params.unit === "string" ? params.unit : null;
  const unitId = billed.some((u) => u.unitId === wanted) ? wanted : null;
  const [locale, open, history] = await Promise.all([
    pageLocale(),
    page === 1 ? loadOpenInvoices(unitId ?? undefined) : Promise.resolve<Loaded<InvoiceView[]>>({ data: [] }),
    loadInvoicePage(page, unitId ?? undefined),
  ]);
  const showUnit = actor.status === "signed-in" && actor.units.length > 1 && unitId === null;
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
          unitFilter={
            billed.length > 1
              ? { units: billed.map((u) => ({ unitId: u.unitId, unitNo: u.unitNo })), current: unitId }
              : undefined
          }
          vapidKey={serverEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY}
        />
      )}
    </ResidentShell>
  );
}
