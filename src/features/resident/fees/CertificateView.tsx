import { useTranslations } from "next-intl";

import { CLEARANCE_STATUS } from "@/domain/status/juristic";
import { PaperDocument } from "@/features/shared/Screen";
import { formatDate, formatTHB } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { DebtClearance } from "@/lib/api/types";
import { StatusBadge } from "@/ui/components/Badge";
import { Callout } from "@/ui/components/Callout";

import { DocumentControl } from "./DocumentControl";
import { ShareCertificate } from "./ShareCertificate";

/**
 * A debt-clearance certificate (D-306) as paper: number, the day it speaks for, valid until, issued; the verification
 * code's last characters (the whole code is printed in the PDF's QR). Download and share are outlined — the paper is
 * the point, not a button. A request waiting for its fee, or refused by the office, says so in place of the actions.
 */
export function CertificateView({
  clearance,
  unitName,
  locale,
  verifyUrl,
}: {
  clearance: DebtClearance;
  unitName: string;
  locale: Locale;
  /** `<web>/verify/<code>` — only right after issue (the API returns the code once). */
  verifyUrl?: string;
}) {
  const t = useTranslations("resident.fees.clearance");
  const status = useTranslations();
  const meta = CLEARANCE_STATUS[clearance.state];
  return (
    <div className="flex flex-col gap-4" data-testid="clearance-certificate" data-state={clearance.state}>
      <PaperDocument
        labelledBy="clearance-title"
        kind={t("paperTitle")}
        issuer={unitName}
        number={clearance.number ?? undefined}
        facts={[
          { key: "asOf", label: t("asOf"), value: formatDate(clearance.asOf, locale) },
          {
            key: "valid",
            label: t("validUntil"),
            value: clearance.validUntil ? formatDate(clearance.validUntil, locale) : "—",
          },
          { key: "holder", label: t("holder"), value: clearance.partyName },
          {
            key: "issued",
            label: t("issued"),
            value: clearance.issuedAt ? formatDate(clearance.issuedAt, locale) : t("notYet"),
          },
        ]}
      >
        <div className="flex flex-col gap-2">
          <span>
            <StatusBadge status={meta} label={status(meta.labelKey)} />
          </span>
          {clearance.state === "issued" ? (
            <p className="text-sm">{t("issuedBody", { date: formatDate(clearance.asOf, locale) })}</p>
          ) : null}
          {clearance.verifyCodeHint ? (
            <p className="text-muted text-sm">
              {t("codeHint")}{" "}
              <span className="text-fg font-mono">{t("codeMasked", { hint: clearance.verifyCodeHint })}</span>
            </p>
          ) : null}
        </div>
      </PaperDocument>

      {clearance.state === "requested" ? (
        <Callout tone="info" title={t("requestedTitle")}>
          {t("requestedBody", { fee: formatTHB(clearance.fee, locale) })}
        </Callout>
      ) : null}
      {clearance.state === "refused" ? (
        <Callout tone="info" title={t("refusedTitle")}>
          {clearance.refuseReason ?? t("refusedBody")}
        </Callout>
      ) : null}

      {clearance.state === "issued" && clearance.number ? (
        <div className="flex flex-col gap-2">
          <DocumentControl
            target={{ kind: "clearance", unitId: clearance.unitId, id: clearance.id }}
            label={t("download")}
            testId="clearance-download"
          />
          <ShareCertificate
            unitId={clearance.unitId}
            clearanceId={clearance.id}
            verifyUrl={verifyUrl}
            text={t("share.text", {
              number: clearance.number,
              unit: unitName,
              date: formatDate(clearance.asOf, locale),
              valid: clearance.validUntil ? formatDate(clearance.validUntil, locale) : "—",
            })}
          />
        </div>
      ) : null}
    </div>
  );
}
