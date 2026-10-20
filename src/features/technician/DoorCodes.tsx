"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatDateTime } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { isApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { IconKey } from "@/ui/icons/glyphs/key";

/**
 * The time-boxed door codes of this visit (`GET …/access`, D-070, D-211): fetched only on request, since every
 * reveal is audited; they work only inside the visit window and end with the work order.
 */
export function DoorCodes({ workOrderId }: { workOrderId: string }) {
  const t = useTranslations("technician.workOrders.detail");
  const current = useLocale();
  const locale = isLocale(current) ? current : "th";
  const [codes, setCodes] = useState<Schemas["RevealedCredentialDto"][] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  if (codes) {
    return codes.length === 0 ? (
      <p className="text-muted text-sm">{t("doorCodesNone")}</p>
    ) : (
      <ul className="flex flex-col gap-2" role="list" data-testid="wo-door-codes">
        {codes.map((c) => (
          <li key={c.id} className="border-border rounded-control border p-3">
            <p className="font-medium">{c.lockName}</p>
            {c.pin ? (
              <p className="font-mono text-3xl font-semibold tracking-[0.2em] tabular-nums">
                <span className="sr-only">{t("doorCodeLabel", { lock: c.lockName })}: </span>
                {c.pin}
              </p>
            ) : null}
            <p className="text-muted text-xs">
              {t("doorCodeValid", {
                from: formatDateTime(c.validFrom, locale),
                to: c.validTo ? formatDateTime(c.validTo, locale) : "—",
              })}
            </p>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="lg"
        block
        iconStart={IconKey}
        loading={busy}
        data-testid="wo-door-codes-show"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const result = unwrap(
              await browserApi.GET("/v1/technician/work-orders/{workOrderId}/access", {
                params: { path: { workOrderId } },
              }),
            );
            setCodes(result.data);
          } catch (caught) {
            if (!isApiError(caught)) throw caught;
            setError(caught);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("doorCodesShow")}
      </Button>
      <p className="text-muted text-sm">{t("doorCodesHint")}</p>
      {error ? <ProblemCallout error={error} /> : null}
    </div>
  );
}
