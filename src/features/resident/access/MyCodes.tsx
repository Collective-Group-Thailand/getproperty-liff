"use client";

import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { CREDENTIAL_STATUS } from "@/domain/status/credential";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatDateTime } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import type { CredentialsView } from "@/lib/api/contract-requests";
import { isApiError, type ApiError } from "@/lib/api/problem";
import { StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconHide } from "@/ui/icons/glyphs/hide";
import { IconKey } from "@/ui/icons/glyphs/key";
import { IconLock } from "@/ui/icons/glyphs/lock";

import { VisitorCode } from "./VisitorCode";

/**
 * My own door codes (D-070, D-071, D-211). Every reveal is audited by the API, so the codes are fetched only when
 * the resident asks ("show my codes") and dropped again with "hide". Resident codes last until the lease ends —
 * never cut for arrears (D-024, D-071); the app shows what the API returns. CONTRACT-REQUEST #26: the visitor-code
 * form when the API says the operator allows it.
 */
export function MyCodes({ unitId }: { unitId: string }) {
  const t = useTranslations("resident.access");
  const root = useTranslations();
  const current = useLocale();
  const locale = isLocale(current) ? current : "th";
  const [codes, setCodes] = useState<CredentialsView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (!codes) {
    return (
      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          block
          iconStart={IconKey}
          loading={busy}
          data-testid="access-show"
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              setCodes(unwrap(await browserApi.GET("/v1/resident/access/credentials")) as CredentialsView);
            } catch (caught) {
              if (!isApiError(caught)) throw caught;
              setError(caught);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t("show")}
        </Button>
        <p className="text-muted text-sm">{t("showHint")}</p>
        {error ? <ProblemCallout error={error} /> : null}
      </div>
    );
  }

  const mine = codes.data.filter((c) => c.holderKind === "resident");
  return (
    <div className="flex flex-col gap-3" data-testid="access-codes">
      {mine.length === 0 ? (
        <EmptyState icon={IconLock} title={t("none")} description={t("noneBody")} />
      ) : (
        <ul className="flex flex-col gap-2" role="list">
          {mine.map((c) => {
            const status = CREDENTIAL_STATUS[c.status];
            return (
              <li key={c.id}>
                <Card padding="md" className="flex flex-col gap-1" data-testid="access-code">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{c.lockName}</p>
                    <StatusBadge status={status} label={root(status.labelKey)} size="sm" />
                  </div>
                  {c.pin ? (
                    <p className="font-mono text-3xl font-semibold tracking-[0.2em] tabular-nums">
                      <span className="sr-only">{t("codeLabel", { lock: c.lockName })}: </span>
                      <span data-testid="access-pin">{c.pin}</span>
                    </p>
                  ) : (
                    <p className="text-muted text-sm">{t("noCode")}</p>
                  )}
                  <p className="text-muted text-xs">
                    {c.validTo ? t("until", { date: formatDateTime(c.validTo, locale) }) : t("untilLease")}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      <Button variant="ghost" size="lg" iconStart={IconHide} onClick={() => setCodes(null)} data-testid="access-hide">
        {t("hide")}
      </Button>
      {/* CONTRACT-REQUEST #26: only when the API says the operator allows visitor codes. */}
      {codes.visitorPolicy?.allowed ? <VisitorCode unitId={unitId} maxHours={codes.visitorPolicy.maxHours} /> : null}
    </div>
  );
}
