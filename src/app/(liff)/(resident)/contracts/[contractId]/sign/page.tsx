import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { ContractReader } from "@/features/resident/contracts/ContractReader";
import { ContractSignFlow } from "@/features/resident/contracts/ContractSignFlow";
import { loadContract } from "@/features/resident/contracts/data";
import { awaitsMySignature } from "@/features/resident/contracts/model";
import { pageLocale } from "@/features/resident/lease/data";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { BackLink } from "@/features/shared/BackLink";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";

export async function generateMetadata() {
  const t = await getTranslations("resident.contracts.sign");
  return { title: t("pageTitle") };
}

/**
 * The e-signature of a document of the contract library (GL3, D-294, D-062) — only when the API offers `sign`;
 * otherwise the resident is told why and sent back to the document.
 */
export default async function ContractSignPage({ params }: { params: Promise<{ contractId: string }> }) {
  const { contractId } = await params;
  const [t, locale, loaded] = await Promise.all([
    getTranslations("resident.contracts"),
    pageLocale(),
    loadContract(contractId),
  ]);
  if (loaded.error) {
    return (
      <ResidentShell active={null}>
        <ProblemPage error={loaded.error} />
      </ResidentShell>
    );
  }
  const contract = loaded.data;
  if (!awaitsMySignature(contract)) {
    return (
      <ResidentShell active={null}>
        <div className="flex flex-col gap-4 py-6" data-testid="sign-unavailable">
          <Callout tone="info" title={t("sign.unavailableTitle")}>
            {contract.state === "pending_signature" || contract.state === "signed"
              ? t("sign.alreadySigned")
              : t("sign.unavailableBody")}
          </Callout>
          <Button asChild size="lg" block>
            <Link href={`/contracts/${contract.id}`}>{t("sign.done.back")}</Link>
          </Button>
        </div>
      </ResidentShell>
    );
  }
  return (
    <ResidentShell active={null}>
      <BackLink href={`/contracts/${contract.id}`}>{t("back.document")}</BackLink>
      <ContractSignFlow contract={contract} reader={<ContractReader contract={contract} locale={locale} />} />
    </ResidentShell>
  );
}
