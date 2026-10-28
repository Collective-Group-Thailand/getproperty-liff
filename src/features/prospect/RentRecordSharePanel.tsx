"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { LazyCheckbox, WhenNear } from "@/features/shared/WhenNear";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { Icon } from "@/ui/icons";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";

/**
 * Share my rent record with this enquiry (D-256): explicit consent each time (never pre-ticked), the owner sees the
 * facts on this enquiry only, and I can stop sharing at once. Hidden while I have no confirmed month.
 */
export function RentRecordSharePanel({
  leadId,
  record,
  share,
}: {
  leadId: string;
  record: Schemas["RentRecordDto"];
  /** The live share with this enquiry, if any. */
  share: Schemas["RentRecordShareDto"] | null;
}) {
  const t = useTranslations("rentRecord.enquiry");
  const router = useRouter();
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  if (!record.months.length) return null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      as="section"
      padding="md"
      className="flex flex-col gap-3"
      aria-labelledby="enquiry-rent-record"
      data-testid="enquiry-rent-record"
      data-shared={share ? "true" : undefined}
    >
      <h2 id="enquiry-rent-record" className="font-semibold">
        {t("title")}
      </h2>
      <p className="text-muted text-sm">
        {t("summary", { onTime: record.onTime, late: record.late, outstanding: record.outstanding })}
      </p>
      {share ? (
        <>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Icon icon={IconCheckCircle} className="text-primary" />
            {t("shared")}
          </p>
          <Button
            variant="secondary"
            block
            loading={busy}
            onClick={() =>
              void run(async () =>
                unwrap(
                  await browserApi.POST("/v1/prospect/me/rent-record/shares/{shareId}/actions/revoke", {
                    params: { path: { shareId: share.id } },
                  }),
                ),
              )
            }
            data-testid="enquiry-rent-record-stop"
          >
            {t("stop")}
          </Button>
        </>
      ) : (
        <>
          {/* D-179: the Radix checkbox loads as the panel comes near the screen (enquiry page ≤ 180 KB, GL2). */}
          <WhenNear testId="enquiry-rent-record-consent-slot">
            <LazyCheckbox
              checked={agree}
              onCheckedChange={(value) => setAgree(value === true)}
              label={t("consent")}
              data-testid="enquiry-rent-record-consent"
            />
          </WhenNear>
          <Button
            block
            disabled={!agree}
            loading={busy}
            onClick={() =>
              void run(async () =>
                unwrap(
                  await browserApi.POST("/v1/prospect/enquiries/{leadId}/rent-record", {
                    params: { path: { leadId } },
                  }),
                ),
              )
            }
            data-testid="enquiry-rent-record-share"
          >
            {t("share")}
          </Button>
        </>
      )}
      {error ? <ProblemCallout error={error} /> : null}
    </Card>
  );
}
