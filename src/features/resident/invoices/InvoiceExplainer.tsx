import { getTranslations } from "next-intl/server";

import { formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { InvoiceView } from "@/lib/api/types";
import { ExternalLinkButton } from "@/features/shared/ExternalLinkButton";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";

import { LEGAL_REFERENCE_URL } from "./legal";
import { isMeterLine, isZero } from "./model";

/**
 * "Invoice explained" (L2 2.1 §3): why the amount is what it is, in plain words from i18n — rent from the lease,
 * meters as units × price per unit, an estimate settled later (D-031), the earlier balance carried (D-193), late
 * fees only when the lease says so and only on a later invoice (D-201) — and the law that caps utility prices and
 * requires units and price per unit on the invoice, with its reference (`<Callout legalRef>`) and a link out.
 * Only the paragraphs that apply to this invoice are shown.
 */
export async function InvoiceExplainer({ invoice, locale }: { invoice: InvoiceView; locale: Locale }) {
  const t = await getTranslations("resident.invoices.explained");
  const hasRent = invoice.lines.some((line) => line.lineKind === "rent");
  const hasMeter = invoice.lines.some(isMeterLine);
  const hasPrior = !isZero(invoice.priorBalance);
  return (
    <Card as="section" padding="md" aria-labelledby="explained-title" data-testid="invoice-explained">
      <h2 id="explained-title" className="font-semibold">
        {t("title")}
      </h2>
      <div className="mt-2 flex flex-col gap-2 text-sm">
        {hasRent ? <p>{t("rent")}</p> : null}
        {hasMeter ? <p>{t("meters")}</p> : null}
        {hasMeter ? <p>{t("sources")}</p> : null}
        {invoice.hasEstimate ? <p>{t("estimate")}</p> : null}
        {hasPrior ? <p>{t("prior", { amount: formatTHB(invoice.priorBalance, locale) })}</p> : null}
        {invoice.status === "overdue" ? <p>{t("late")}</p> : null}
        <p>{t("questions", { issuer: invoice.issuerName })}</p>
      </div>
      {hasMeter ? (
        <div className="mt-3">
          <Callout tone="neutral" title={t("lawTitle")} legalRef={t("legalRef")}>
            <span className="block">{t("lawBody")}</span>
            <ExternalLinkButton href={LEGAL_REFERENCE_URL}>{t("lawLink")}</ExternalLinkButton>
          </Callout>
        </div>
      ) : null}
    </Card>
  );
}
