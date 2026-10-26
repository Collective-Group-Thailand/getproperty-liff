"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { LazyAlertDialog } from "@/ui/components/overlays";
import { IconCheck } from "@/ui/icons/glyphs/check";
import { IconCopy } from "@/ui/icons/glyphs/copy";

type Share = Schemas["RentRecordShareDto"];
type Letter = Schemas["RentRecordLetterDto"];
export type RentRecordAudience = "resident" | "prospect";

async function createLetter(audience: RentRecordAudience): Promise<Letter> {
  return audience === "resident"
    ? unwrap(await browserApi.POST("/v1/resident/me/rent-record/letters"))
    : unwrap(await browserApi.POST("/v1/prospect/me/rent-record/letters"));
}

async function revoke(audience: RentRecordAudience, shareId: string): Promise<Share> {
  const params = { params: { path: { shareId } } };
  return audience === "resident"
    ? unwrap(await browserApi.POST("/v1/resident/me/rent-record/shares/{shareId}/actions/revoke", params))
    : unwrap(await browserApi.POST("/v1/prospect/me/rent-record/shares/{shareId}/actions/revoke", params));
}

/** The code of a new letter, shown once (only its hash is kept), with copy. */
function LetterCode({ letter }: { letter: Letter }) {
  const t = useTranslations("rentRecord.letter");
  const [copied, setCopied] = useState(false);
  const text = t("copyText", { code: letter.code, url: letter.verifyUrl });
  return (
    <div
      className="border-primary bg-primary-subtle rounded-card flex flex-col gap-3 border p-4"
      data-testid="rent-record-code"
    >
      <p className="text-sm">{t("once")}</p>
      <p className="font-mono text-2xl font-semibold tracking-widest break-all" data-testid="rent-record-code-value">
        {letter.code}
      </p>
      <p className="text-muted text-sm break-all">{letter.verifyUrl}</p>
      <Button
        variant="secondary"
        iconStart={copied ? IconCheck : IconCopy}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
        data-testid="rent-record-copy"
      >
        <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
      </Button>
    </div>
  );
}

/**
 * What I shared of my rent record (D-256) — each enquiry and letter with its state and a way to stop it at once —
 * and a new letter with a verification code for a landlord outside getproperty.
 */
export function RentRecordShares({
  audience,
  shares,
  canShare,
  locale,
}: {
  audience: RentRecordAudience;
  shares: Share[];
  /** False while no month is confirmed (`rent_record.empty`). */
  canShare: boolean;
  locale: Locale;
}) {
  const t = useTranslations("rentRecord");
  const router = useRouter();
  const [letter, setLetter] = useState<Letter | null>(null);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState<Share | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function newLetter() {
    setBusy(true);
    setError(null);
    try {
      setLetter(await createLetter(audience));
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function stop(share: Share) {
    setBusy(true);
    setError(null);
    try {
      await revoke(audience, share.id);
      setStopping(null);
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="rent-record-letter" className="flex flex-col gap-3">
        <h2 id="rent-record-letter" className="font-semibold">
          {t("letter.title")}
        </h2>
        <p className="text-muted text-sm">{t("letter.body")}</p>
        {letter ? <LetterCode letter={letter} /> : null}
        {canShare ? (
          <Button
            size="lg"
            block
            loading={busy && !stopping}
            onClick={() => void newLetter()}
            data-testid="rent-record-new-letter"
          >
            {t("letter.create")}
          </Button>
        ) : (
          <Callout tone="neutral">{t("letter.empty")}</Callout>
        )}
      </section>

      <section aria-labelledby="rent-record-shares" className="flex flex-col gap-2">
        <h2 id="rent-record-shares" className="font-semibold">
          {t("shares.title")}
        </h2>
        {shares.length === 0 ? (
          <p className="text-muted text-sm">{t("shares.empty")}</p>
        ) : (
          <ul className="divide-border flex flex-col divide-y" role="list" data-testid="rent-record-shares">
            {shares.map((share) => (
              <li
                key={share.id}
                className="flex items-center justify-between gap-3 py-3"
                data-testid="rent-record-share"
                data-state={share.state}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">
                    {share.lead
                      ? t("shares.enquiry", { listing: share.lead.listingTitle, owner: share.lead.ownerName })
                      : t("shares.letter", { hint: share.codeHint ?? "" })}
                  </span>
                  <span className="text-muted text-xs">
                    {share.state === "live" && share.expiresAt
                      ? t("shares.until", { date: formatDate(share.expiresAt, locale) })
                      : t("shares.since", { date: formatDate(share.createdAt, locale) })}
                  </span>
                </span>
                {share.state === "live" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setStopping(share)}
                    data-testid="rent-record-stop"
                  >
                    {t("shares.stop")}
                  </Button>
                ) : (
                  <Badge tone="neutral" size="sm">
                    {t(`shares.state.${share.state}`)}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {error ? <ProblemCallout error={error} /> : null}
      <LazyAlertDialog
        open={stopping !== null}
        onOpenChange={(open) => (open ? null : setStopping(null))}
        title={t("shares.stopTitle")}
        description={t("shares.stopBody")}
        confirmLabel={t("shares.stop")}
        cancelLabel={t("shares.keep")}
        tone="destructive"
        loading={busy}
        onConfirm={() => stopping && void stop(stopping)}
      />
    </div>
  );
}
