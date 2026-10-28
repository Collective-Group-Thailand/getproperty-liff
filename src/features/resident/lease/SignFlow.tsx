"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { ESignFlow } from "@/features/resident/esign/ESignFlow";
import { browserApi, unwrap } from "@/lib/api/browser";
import type { ResidentLease } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconForward } from "@/ui/icons/glyphs/forward";

/**
 * The resident's e-signature of a lease (D-062, L3 3.1 §2) — the generic flow (`ESignFlow`) on the lease endpoints:
 * the document and its sha256 from `GET …/contract`, the SMS code from `POST …/signature/otp`, the signature to
 * `POST …/sign`; a changed document is `lease.contract_changed`.
 */
export function SignFlow({ lease, reader }: { lease: ResidentLease; reader: React.ReactNode }) {
  const t = useTranslations("resident.lease.sign");
  const path = { leaseId: lease.id };
  return (
    <ESignFlow<ResidentLease>
      namespace="resident.lease.sign"
      reader={reader}
      changedCode="lease.contract_changed"
      loadDocument={async () =>
        unwrap(await browserApi.GET("/v1/resident/leases/{leaseId}/contract", { params: { path } }))
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
