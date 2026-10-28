import { getTranslations } from "next-intl/server";

import type { Locale } from "@/i18n/routing";
import type { ResidentContract } from "@/lib/api/types";

import { ContractSigners, ContractTerms, LegalNotice } from "./ContractParts";

/**
 * What the resident reads before signing a document of the contract library (rendered on the server and handed to the
 * sign flow, so the reading step costs no client JavaScript): the title, the legal-review state and disclaimer as the
 * API returns them, the typed terms and the signers; the PDF stays the binding text, one tap away in the flow.
 */
export async function ContractReader({ contract, locale }: { contract: ResidentContract; locale: Locale }) {
  const t = await getTranslations("resident.contracts");
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">{t(`kind.${contract.kind}`)}</h2>
        <p className="text-sm" lang={contract.language}>
          {contract.title}
        </p>
        {contract.number ? <p className="text-muted text-sm">{t("list.number", { number: contract.number })}</p> : null}
      </div>
      <LegalNotice contract={contract} locale={locale} />
      <ContractTerms contract={contract} locale={locale} />
      <div>
        <h3 className="mb-1 text-sm font-semibold">{t("signers.title")}</h3>
        <ContractSigners contract={contract} locale={locale} />
      </div>
    </div>
  );
}
