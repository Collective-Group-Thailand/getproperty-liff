"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import { ESignFlow } from "@/features/resident/esign/ESignFlow";
import { browserApi, unwrap } from "@/lib/api/browser";
import type { ResidentContract } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconForward } from "@/ui/icons/glyphs/forward";

/**
 * Signing a document of the contract library (GL3, D-294) with the lease's evidence (D-062): the PDF and its sha256
 * from `GET …/document`, the SMS code from `POST …/signature/otp` (in the document's language, Thai or English), the
 * signature to `POST …/sign`; `contract.changed` sends the resident back to read the current document.
 */
export function ContractSignFlow({ contract, reader }: { contract: ResidentContract; reader: React.ReactNode }) {
  const t = useTranslations("resident.contracts.sign");
  const locale = useLocale();
  const path = { contractId: contract.id };
  return (
    <ESignFlow<ResidentContract>
      namespace="resident.contracts.sign"
      reader={reader}
      changedCode="contract.changed"
      alreadySignedCode="contract.already_signed"
      renderedSha256={contract.sha256}
      loadDocument={async () =>
        unwrap(await browserApi.GET("/v1/resident/contracts/{contractId}/document", { params: { path } }))
      }
      requestOtp={async () =>
        unwrap(
          await browserApi.POST("/v1/resident/contracts/{contractId}/signature/otp", {
            params: { path },
            body: { language: locale === "th" ? "th" : "en" },
          }),
        )
      }
      submit={async (body, key) =>
        unwrap(
          await browserApi.POST("/v1/resident/contracts/{contractId}/sign", {
            params: { path, header: { "Idempotency-Key": key } },
            body,
          }),
        )
      }
      renderDone={(signed) => {
        const complete = signed.state === "signed";
        return {
          callout: (
            <Callout
              tone="success"
              icon={IconCheckCircle}
              title={complete ? t("done.completeTitle") : t("done.waitingTitle")}
            >
              {complete ? t("done.completeBody") : t("done.waitingBody")}
            </Callout>
          ),
          actions: (
            <Button asChild size="lg" block iconEnd={IconForward}>
              <Link href={`/contracts/${contract.id}`} data-testid="contract-sign-back">
                {t("done.back")}
              </Link>
            </Button>
          ),
        };
      }}
    />
  );
}
