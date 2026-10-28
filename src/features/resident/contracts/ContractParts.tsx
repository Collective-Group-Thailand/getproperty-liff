import { getTranslations } from "next-intl/server";

import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { ResidentContract } from "@/lib/api/types";
import { Callout } from "@/ui/components/Callout";
import { IconShield } from "@/ui/icons/glyphs/shield";
import { IconWarning } from "@/ui/icons/glyphs/warning";

import { disclaimerText } from "./model";

/**
 * The legal-review state and the disclaimer exactly as the API returns them (D-290, D-294, O-025): a draft still
 * `pending_legal_verification` says so plainly, and the platform's disclaimer (Thai or English, its own wording) is
 * shown under it either way — no document is ever presented as lawyer-approved by this app.
 */
export async function LegalNotice({
  contract,
  locale,
}: {
  contract: Pick<ResidentContract, "legalReviewState" | "disclaimer">;
  locale: Locale;
}) {
  const t = await getTranslations("resident.contracts.legal");
  const pending = contract.legalReviewState === "pending_legal_verification";
  const disclaimer = disclaimerText(contract.disclaimer, locale);
  return (
    <div data-testid="contract-legal" data-state={contract.legalReviewState}>
      <Callout
        tone={pending ? "warning" : "neutral"}
        icon={pending ? IconWarning : IconShield}
        title={pending ? t("pendingTitle") : t("reviewedTitle")}
      >
        <span className="block">{pending ? t("pendingBody") : t("reviewedBody")}</span>
        <span className="mt-2 block font-medium" lang={disclaimer.lang} data-testid="contract-disclaimer">
          {disclaimer.text}
        </span>
      </Callout>
    </div>
  );
}

function Row({ label, children, numeric }: { label: string; children: React.ReactNode; numeric?: boolean }) {
  return (
    <div className="border-border flex items-baseline justify-between gap-4 border-b py-2 last:border-b-0">
      <dt className="text-muted text-sm">{label}</dt>
      <dd className={numeric ? "text-right font-medium tabular-nums" : "text-right font-medium"}>{children}</dd>
    </div>
  );
}

/**
 * What the office typed when it drafted the document (`variables`, per kind: reservation fee, rent, move-in date, held
 * until, refund terms; addendum clauses and the date they apply from; further terms). Values are the API's strings:
 * money through `formatTHB`, dates in Bangkok time — nothing computed.
 */
export async function ContractTerms({ contract, locale }: { contract: ResidentContract; locale: Locale }) {
  const t = await getTranslations("resident.contracts.terms");
  const v = contract.variables;
  const date = (value: string) => formatDate(value, locale);
  const money = (value: string) => formatTHB(value, locale);
  const rows: [string, React.ReactNode, boolean][] = [];
  if (v.fee) rows.push([t("fee"), money(v.fee), true]);
  if (v.rent) rows.push([t("rent"), t("perMonth", { amount: money(v.rent) }), true]);
  if (v.moveInDate) rows.push([t("moveInDate"), date(v.moveInDate), false]);
  if (v.expiresOn) rows.push([t("expiresOn"), date(v.expiresOn), false]);
  if (v.effectiveDate) rows.push([t("effectiveDate"), date(v.effectiveDate), false]);
  const clauses = v.clauses ?? [];
  if (!rows.length && !clauses.length && !v.refundTerms && !v.note) return null;
  return (
    <div data-testid="contract-terms">
      {rows.length ? (
        <dl className="m-0">
          {rows.map(([label, value, numeric]) => (
            <Row key={label} label={label} numeric={numeric}>
              {value}
            </Row>
          ))}
        </dl>
      ) : null}
      {v.refundTerms ? (
        <div className="mt-3">
          <h3 className="text-sm font-semibold">{t("refundTerms")}</h3>
          <p className="text-muted text-sm" lang={contract.language}>
            {v.refundTerms}
          </p>
        </div>
      ) : null}
      {clauses.length ? (
        <div className="mt-3">
          <h3 className="text-sm font-semibold">{t("clauses")}</h3>
          <ol className="mt-1 flex list-decimal flex-col gap-2 ps-5 text-sm" lang={contract.language}>
            {clauses.map((clause, index) => (
              <li key={`${clause.title}-${index}`}>
                <span className="font-medium">{clause.title}</span>
                <span className="text-muted block">{clause.text}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      {v.note ? (
        <div className="mt-3">
          <h3 className="text-sm font-semibold">{t("note")}</h3>
          <p className="text-muted text-sm" lang={contract.language}>
            {v.note}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Who signs, in the API's order, and when each one did. */
export async function ContractSigners({ contract, locale }: { contract: ResidentContract; locale: Locale }) {
  const t = await getTranslations("resident.contracts.signers");
  return (
    <ul className="flex flex-col gap-2" role="list" data-testid="contract-signers">
      {contract.signers.map((signer) => (
        <li key={signer.index} className="flex flex-wrap items-baseline justify-between gap-2">
          <span>{signer.name}</span>
          <span className="text-muted text-sm">
            {t(`role.${signer.role}`)} ·{" "}
            {signer.signedAt ? t("signed", { date: formatDate(signer.signedAt, locale) }) : t("notSigned")}
          </span>
        </li>
      ))}
    </ul>
  );
}
