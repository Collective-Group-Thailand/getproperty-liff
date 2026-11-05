"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { openExternal, shareToLine } from "@/lib/liff/client";
import { Button } from "@/ui/components/Button";
import { IconForward } from "@/ui/icons/glyphs/forward";

import { documentUrl } from "./DocumentControl";

type Outcome = "idle" | "sent" | "shared" | "copied" | "opened" | "failed";

/**
 * Passing the debt-clearance certificate on (to a buyer, an agent, the land office). Right after issue the API returns
 * the verification code once: the message then carries the public verification link (`<web>/verify/<code>`, holder's
 * initials only — D-306) through LINE's share picker, the system share sheet or the clipboard. Later the code is gone
 * (only its hash is stored), so the certificate itself is shared as a file where the phone can, else opened to save.
 */
export function ShareCertificate({
  unitId,
  clearanceId,
  text,
  verifyUrl,
}: {
  unitId: string;
  clearanceId: string;
  /** The message, already worded (number, unit, as-of, valid until). */
  text: string;
  verifyUrl?: string;
}) {
  const t = useTranslations("resident.fees.clearance.share");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("idle");

  async function share(): Promise<Outcome> {
    if (verifyUrl) {
      const message = `${text}\n${t("verify", { url: verifyUrl })}`;
      const viaLine = await shareToLine([{ type: "text", text: message }]);
      if (viaLine === "sent") return "sent";
      if (viaLine === "cancelled") return "idle";
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({ text: message, url: verifyUrl });
          return "shared";
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return "idle";
        }
      }
      await navigator.clipboard.writeText(message);
      return "copied";
    }
    const url = new URL(await documentUrl({ kind: "clearance", unitId, id: clearanceId }), window.location.href);
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], `${t("fileName")}.pdf`, { type: "application/pdf" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text });
        return "shared";
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "idle";
    }
    await openExternal(url.toString());
    return "opened";
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="lg"
        block
        loading={busy}
        iconStart={IconForward}
        data-testid="clearance-share"
        onClick={async () => {
          setBusy(true);
          try {
            setOutcome(await share());
          } catch {
            setOutcome("failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {t("button")}
      </Button>
      <p className="text-muted text-sm" aria-live="polite" data-testid="clearance-share-outcome">
        {outcome === "idle" ? "" : t(`outcome.${outcome}`)}
      </p>
    </div>
  );
}
