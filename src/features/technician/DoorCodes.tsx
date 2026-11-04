"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatDateTime } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";

/** What stands for a code until it is revealed. */
const MASK = "\u2022".repeat(6);

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
  const reveal = async () => {
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
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      {codes === null ? (
        // Masked until asked for: every reveal is audited (D-211), so the code is fetched only on this tap.
        <div className="rounded-control border-border flex min-h-14 items-center justify-between gap-3 border ps-4 pe-1.5">
          <span aria-hidden="true" className="text-muted font-mono text-xl tracking-[0.35em]">
            {MASK}
          </span>
          <span className="sr-only">{t("doorCodesHidden")}</span>
          <Button variant="secondary" loading={busy} onClick={() => void reveal()} data-testid="wo-door-codes-show">
            {t("doorCodesShow")}
          </Button>
        </div>
      ) : codes.length === 0 ? (
        <p className="text-muted text-sm">{t("doorCodesNone")}</p>
      ) : (
        <ul className="flex flex-col gap-2" role="list" data-testid="wo-door-codes">
          {codes.map((c) => (
            <li key={c.id} className="rounded-control border-border flex flex-col gap-0.5 border px-4 py-3">
              <p className="text-muted text-sm">{c.lockName}</p>
              {c.pin ? (
                <p className="font-mono text-2xl font-semibold tracking-[0.2em] tabular-nums">
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
      )}
      <p className="text-muted text-sm">{t("doorCodesHint")}</p>
      {error ? <ProblemCallout error={error} /> : null}
    </div>
  );
}
