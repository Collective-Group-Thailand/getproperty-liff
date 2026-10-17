"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { formatDateTime, formatTHB } from "@/i18n/format";
import { isLocale, type Locale } from "@/i18n/routing";
import type { InvoiceView } from "@/lib/api/contract-requests";
import type { ResidentPayment } from "@/lib/api/types";
import { inLineClient, openExternal } from "@/lib/liff/client";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { MoneyDisplay } from "@/ui/components/MoneyDisplay";
import { Progress } from "@/ui/components/Progress";
import { Spinner } from "@/ui/components/Spinner";
import { IconBank } from "@/ui/icons/glyphs/bank";
import { IconDownload } from "@/ui/icons/glyphs/download";
import { IconExternal } from "@/ui/icons/glyphs/external";
import { IconRefresh } from "@/ui/icons/glyphs/refresh";
import { IconUpload } from "@/ui/icons/glyphs/upload";

import { BANK_APPS } from "./bankApps";
import { canvasBlob, qrCanvas, qrModules } from "./qr";
import { QrImage } from "./QrImage";
import { COUNTDOWN_BAR_SECONDS, formatCountdown, qrValidity } from "./validity";

/** "now" for the QR's validity: re-rendered every second in its last hour, otherwise once a minute. */
function useNow(expiresAt: string | null): number {
  const [now, setNow] = useState(() => Date.now());
  const ticking = qrValidity(expiresAt, now).kind === "countdown";
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ticking ? 1000 : 60_000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}

/**
 * Saves the QR with its amount and reference printed under it: the system share sheet where it can take a file
 * (save to Photos), else a download. Inside LINE the picture itself can be pressed and held (the copy says so).
 */
async function saveQr(payload: string, text: { amount: string; reference: string; payee?: string }): Promise<boolean> {
  const canvas = qrCanvas(qrModules(payload), text);
  const blob = canvas ? await canvasBlob(canvas) : null;
  if (!blob) return false;
  const file = new File([blob], `thai-qr-${text.reference.replace(/\W+/g, "")}.png`, { type: "image/png" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch {
      // Closed the share sheet, or the browser refused: fall through to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

export function QrPanel({
  invoice,
  payment,
  refreshing,
  onRefresh,
  onSlip,
}: {
  invoice: InvoiceView;
  payment: ResidentPayment;
  refreshing: boolean;
  onRefresh: () => void;
  onSlip: () => void;
}) {
  const t = useTranslations("resident.pay");
  const current = useLocale();
  const locale: Locale = isLocale(current) ? current : "th";
  const qr = payment.qr;
  const account = payment.account;
  const [inLine, setInLine] = useState(false);
  const [banksOpen, setBanksOpen] = useState(false);
  const [saved, setSaved] = useState<"idle" | "saved" | "failed">("idle");

  useEffect(() => {
    let alive = true;
    void inLineClient().then((value) => alive && setInLine(value));
    return () => {
      alive = false;
    };
  }, []);

  const now = useNow(qr?.expiresAt ?? null);
  const validity = qrValidity(qr?.expiresAt ?? null, now);
  const expired = validity.kind === "expired";
  const amount = qr?.amount ?? payment.due;
  // What is due now can include earlier unpaid invoices of the unit, oldest paid first (D-193) — the API's figure.
  const includesEarlier = payment.due !== invoice.balance;

  return (
    <div className="flex flex-col gap-4" data-testid="pay-qr-panel">
      <div className="text-center">
        <p className="text-muted text-sm">{t("amountLabel")}</p>
        <MoneyDisplay amount={amount} locale={locale} size="hero" />
        {includesEarlier ? (
          <p className="text-muted mt-1 text-sm" data-testid="pay-includes-earlier">
            {t("includesEarlier", { balance: formatTHB(invoice.balance, locale) })}
          </p>
        ) : null}
      </div>

      {qr ? (
        <>
          <div className="relative">
            <QrImage
              payload={qr.payload}
              dimmed={expired}
              label={t("qrAlt", { amount: formatTHB(qr.amount, locale), reference: qr.reference })}
            />
            {expired ? (
              <div className="absolute inset-0 flex items-center justify-center p-4">
                <Button iconStart={IconRefresh} loading={refreshing} onClick={onRefresh} data-testid="pay-qr-renew">
                  {t("renew")}
                </Button>
              </div>
            ) : null}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted">{t("reference")}</dt>
            <dd className="font-mono break-all" data-testid="pay-reference">
              {qr.reference}
            </dd>
            {account ? (
              <>
                <dt className="text-muted">{t("payee")}</dt>
                <dd>
                  {account.accountName}
                  <span className="text-muted block">
                    {account.bankNameTh} · {account.accountNoMasked}
                  </span>
                </dd>
              </>
            ) : null}
          </dl>

          <div aria-live="polite" data-testid="pay-validity">
            {validity.kind === "until" ? (
              <p className="text-muted text-sm">
                {t("validUntil", { date: formatDateTime(validity.expiresAt, locale) })}
              </p>
            ) : validity.kind === "countdown" ? (
              validity.seconds <= COUNTDOWN_BAR_SECONDS ? (
                <Progress
                  label={t("validityLabel")}
                  value={validity.seconds}
                  max={COUNTDOWN_BAR_SECONDS}
                  valueText={t("validFor", { time: formatCountdown(validity.seconds) })}
                />
              ) : (
                <p className="text-muted text-sm">{t("validFor", { time: formatCountdown(validity.seconds) })}</p>
              )
            ) : expired ? (
              <Callout tone="warning" title={t("expiredTitle")}>
                {t("expiredBody")}
              </Callout>
            ) : null}
          </div>

          {!expired ? (
            <div className="flex flex-col gap-2">
              <Button
                variant="secondary"
                size="lg"
                block
                iconStart={IconDownload}
                data-testid="pay-save-qr"
                onClick={async () =>
                  setSaved(
                    (await saveQr(qr.payload, {
                      amount: formatTHB(qr.amount, locale),
                      reference: t("referenceShort", { reference: qr.reference }),
                      payee: account?.accountName,
                    }))
                      ? "saved"
                      : "failed",
                  )
                }
              >
                {t("save")}
              </Button>
              {inLine ? <p className="text-muted text-sm">{t("saveHintLine")}</p> : null}
              {saved === "failed" ? <p className="text-sm">{t("saveFailed")}</p> : null}
              <Button
                variant="secondary"
                size="lg"
                block
                iconStart={IconBank}
                aria-expanded={banksOpen}
                aria-controls="pay-banks"
                onClick={() => setBanksOpen((value) => !value)}
                data-testid="pay-open-bank"
              >
                {t("openBank")}
              </Button>
              {banksOpen ? (
                <div id="pay-banks" className="flex flex-col gap-2" data-testid="pay-banks">
                  <p className="text-muted text-sm">{t("openBankHint")}</p>
                  <ul className="grid grid-cols-2 gap-2">
                    {BANK_APPS.map((bank) => (
                      <li key={bank.id}>
                        <Button
                          variant="ghost"
                          size="lg"
                          block
                          iconStart={IconExternal}
                          className="justify-start"
                          onClick={() => void openExternal(bank.url)}
                        >
                          {t(`banks.${bank.id}`)}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <ol className="text-muted list-decimal ps-5 text-sm">
            <li>{t("steps.save")}</li>
            <li>{t("steps.scan")}</li>
            <li>{t("steps.back")}</li>
          </ol>
          <p className="flex items-center gap-2 text-sm" data-testid="pay-waiting">
            <Spinner size="sm" label={t("waitingShort")} />
            {t("waiting")}
          </p>
        </>
      ) : (
        <Callout tone="info" title={t("noQrTitle")}>
          {account ? (
            <span className="block" data-testid="pay-account">
              {t("noQrTransfer", {
                bank: account.bankNameTh,
                name: account.accountName,
                account: account.accountNoMasked,
              })}
            </span>
          ) : (
            t("noQrContact")
          )}
        </Callout>
      )}

      {payment.allowSlip ? (
        <Button variant="ghost" size="lg" block iconStart={IconUpload} onClick={onSlip} data-testid="pay-slip">
          {t("slipCta")}
        </Button>
      ) : null}
    </div>
  );
}
