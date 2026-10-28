import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { CONTRACT_STATUS } from "@/domain/status/contract";
import { ContractDocumentButton } from "@/features/resident/contracts/ContractDocumentButton";
import { ContractSigners, ContractTerms, LegalNotice } from "@/features/resident/contracts/ContractParts";
import { loadContract } from "@/features/resident/contracts/data";
import { awaitsMySignature } from "@/features/resident/contracts/model";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { IconSign } from "@/ui/icons/glyphs/sign";

export async function generateMetadata() {
  const t = await getTranslations("resident.contracts");
  return { title: t("list.title") };
}

/**
 * One document of the contract library (GL3, D-294) — where the LINE message `contract.sent_for_signature` lands:
 * kind, title, number and state, what was typed when it was drafted, who signs, the legal-review state with the
 * platform's disclaimer as the API returns them, the PDF, and *read and sign* when the API offers `sign`.
 */
export default async function ContractPage({ params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  const [t, root, locale, loaded] = await Promise.all([
    getTranslations("resident.contracts"),
    getTranslations(),
    pageLocale(),
    loadContract(contractId),
  ]);
  if (loaded.error) {
    return (
      <ResidentShell active={null}>
        <BackLink href="/contracts">{t("back.list")}</BackLink>
        <ProblemPage error={loaded.error} />
      </ResidentShell>
    );
  }
  const contract = loaded.data;
  const status = CONTRACT_STATUS[contract.state];
  const toSign = awaitsMySignature(contract);
  return (
    <ResidentShell active={null}>
      <BackLink href={contract.leaseId ? `/lease/${contract.leaseId}` : "/contracts"}>
        {contract.leaseId ? t("back.lease") : t("back.list")}
      </BackLink>
      <div
        className="flex flex-col gap-4 py-5"
        data-testid="contract-detail"
        data-kind={contract.kind}
        data-state={contract.state}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-display text-2xl font-semibold">{t(`kind.${contract.kind}`)}</h1>
            <StatusBadge status={status} label={root(status.labelKey)} />
          </div>
          <p className="text-sm" lang={contract.language}>
            {contract.title}
          </p>
          {contract.number ? (
            <p className="text-muted text-sm">{t("list.number", { number: contract.number })}</p>
          ) : null}
        </div>

        {toSign ? (
          <Callout
            tone="info"
            title={t("detail.signTitle")}
            action={
              <Button asChild size="lg" block iconStart={IconSign}>
                <Link href={`/contracts/${contract.id}/sign`} data-testid="contract-sign">
                  {t("detail.signCta")}
                </Link>
              </Button>
            }
          >
            {t("detail.signBody")}
          </Callout>
        ) : contract.state === "pending_signature" ? (
          <Callout tone="info" title={t("detail.waitingTitle")}>
            {t("detail.waitingBody")}
          </Callout>
        ) : contract.state === "signed" ? (
          <Callout tone="success" title={t("detail.signedTitle")}>
            {t("detail.signedBody")}
          </Callout>
        ) : null}

        <LegalNotice contract={contract} locale={locale} />

        <Card as="section" aria-labelledby="contract-terms-title" padding="md">
          <h2 id="contract-terms-title" className="font-semibold">
            {t("detail.termsTitle")}
          </h2>
          <div className="mt-2">
            <ContractTerms contract={contract} locale={locale} />
          </div>
          <p className="text-muted mt-3 text-sm">{t("detail.pdfBinding")}</p>
        </Card>

        <Card as="section" aria-labelledby="contract-signers-title" padding="md">
          <h2 id="contract-signers-title" className="mb-2 font-semibold">
            {t("signers.title")}
          </h2>
          <ContractSigners contract={contract} locale={locale} />
        </Card>

        {contract.nextActions.includes("download") ? (
          <ContractDocumentButton contractId={contract.id} signed={contract.state === "signed"} />
        ) : null}
      </div>
    </ResidentShell>
  );
}
