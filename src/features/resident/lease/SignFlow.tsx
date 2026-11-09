"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { ESignFlow } from "@/features/resident/esign/ESignFlow";
import { bffJson, browserApi, unwrap } from "@/lib/api/browser";
import type { ContractDownload, ResidentLease } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconForward } from "@/ui/icons/glyphs/forward";

/**
 * The resident's e-signature of a lease (D-062, L3 3.1 §2) — the generic flow (`ESignFlow`) on the lease endpoints:
 * the document and its sha256 from `GET …/contract`, the SMS code from `POST …/signature/otp`, the signature to
 * `POST …/sign`; a changed document is `lease.contract_changed`. The page rendered the reader for the lease's
 * `contractSha256` (CR #38), so the flow compares hashes like it does for the library's documents instead of
 * rendering the page again after the document read.
 */
export function SignFlow({ lease, reader }: { lease: ResidentLease; reader: React.ReactNode }) {
  const t = useTranslations("resident.lease.sign");
  const path = { leaseId: lease.id };
  return (
    <ESignFlow<ResidentLease>
      namespace="resident.lease.sign"
      reader={reader}
      renderedSha256={lease.contractSha256}
      changedCode="lease.contract_changed"
      alreadySignedCode="lease.already_signed"
      loadDocument={async () =>
        // Read as the page opens: plain `bffJson`, so the typed client stays off the first load (D-179).
        bffJson<ContractDownload>(`/v1/resident/leases/${encodeURIComponent(path.leaseId)}/contract`)
      }
      requestOtp={async () =>
        unwrap(await browserApi.POST("/v1/resident/leases/{leaseId}/signature/otp", { params: { path }, body: {} }))
      }
      submit={async (body, key) =>
        unwrap(
          await browserApi.POST("/v1/resident/leases/{leaseId}/sign", {
            params: { path, header: { "Idempotency-Key": key } },
            body,
          }),
        )
      }
      renderDone={(signed) => {
        const active = signed.status === "active";
        return {
          callout: (
            <Callout
              tone="success"
              icon={IconCheckCircle}
              title={active ? t("done.activeTitle") : t("done.waitingTitle")}
            >
              {active ? t("done.activeBody") : t("done.waitingBody")}
            </Callout>
          ),
          actions: (
            <Button asChild size="lg" block iconEnd={IconForward}>
              <Link href={`/lease/${lease.id}`}>{t("done.back")}</Link>
            </Button>
          ),
        };
      }}
    />
  );
}
