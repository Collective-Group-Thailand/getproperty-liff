"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useMemo, useState } from "react";

import { qrSvg } from "@/features/shared/qrSvg";
import type { Locale } from "@/i18n/routing";
import { shareToLine } from "@/lib/liff/client";
import type { VisitInviteCreated } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Icon } from "@/ui/icons";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconSend } from "@/ui/icons/glyphs/send";

import { passUrl, plateText } from "./model";
import { windowText } from "./words";

type Outcome = "idle" | "sent" | "shared" | "copied" | "failed";

/**
 * The pass right after it was made (D-327 (5)): the QR the guard scans, shown **once** — the API keeps only its hash,
 * so the screen says plainly that it must be sent now. "Send to the visitor" goes through LINE's share picker (a
 * message with the window and a link to `/pass#…`, which draws the same QR on the visitor's phone; the token stays in
 * the link's fragment and never reaches a server log), then the system share sheet, then the clipboard.
 */
export function InviteCreated({
  invite,
  unitName,
  place,
  locale,
}: {
  invite: VisitInviteCreated;
  unitName: string;
  place: string;
  locale: Locale;
}) {
  const t = useTranslations("resident.visitors.invite.created");
  const kinds = useTranslations("resident.visitors.invite.kinds");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const qr = useMemo(() => qrSvg(invite.token), [invite.token]);
  const window_ = windowText(invite.validFrom, invite.validTo, locale);
  const waiting = invite.state === "pending_approval";

  async function share(): Promise<Outcome> {
    const url = passUrl(globalThis.location.origin, {
      token: invite.token,
      unit: unitName,
      from: invite.validFrom,
      to: invite.validTo,
      place,
    });
    const text = t("message", { place, unit: unitName, window: window_, url });
    const viaLine = await shareToLine([{ type: "text", text }]);
    if (viaLine === "sent") return "sent";
    if (viaLine === "cancelled") return "idle";
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text, url });
        return "shared";
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return "idle";
      }
    }
    await navigator.clipboard.writeText(text);
    return "copied";
  }

  return (
    <div className="flex flex-col gap-5" data-testid="invite-created" data-state={invite.state}>
      <div className="flex items-start gap-3">
        <Icon
          icon={waiting ? IconClock : IconCheckCircle}
          className={waiting ? "text-muted mt-1 shrink-0 text-2xl" : "text-success mt-1 shrink-0 text-2xl"}
          aria-hidden
        />
        <div className="flex flex-col">
          <h2 className="text-xl font-semibold">{waiting ? t("titleWaiting") : t("title")}</h2>
          <p className="text-muted">{waiting ? t("bodyWaiting") : t("body")}</p>
        </div>
      </div>

      <figure className="rounded-card border-border bg-surface shadow-card flex flex-col items-center gap-3 border p-5">
        <svg
          viewBox={`0 0 ${qr.size} ${qr.size}`}
          className="size-60"
          shapeRendering="crispEdges"
          role="img"
          aria-label={t("qrLabel")}
          data-testid="invite-qr"
        >
          <rect width={qr.size} height={qr.size} fill="#fff" />
          <path d={qr.path} fill="#121826" />
        </svg>
        <figcaption className="flex flex-col items-center gap-0.5 text-center">
          <span className="font-semibold">
            {invite.visitorName ?? kinds(invite.visitorKind)}
            {invite.plate ? <span className="font-mono"> · {plateText(invite.plate)}</span> : null}
          </span>
          <span className="text-muted text-sm">{window_}</span>
          <span className="text-muted text-sm">
            {invite.usage === "single" ? t("once") : t("times", { count: invite.maxUses })}
          </span>
        </figcaption>
      </figure>

      <div data-testid="invite-once">
        <Callout tone="warning" size="sm">
          {t("once_warning")}
        </Callout>
      </div>

      <div className="flex flex-col gap-2">
        <Button
          size="lg"
          block
          iconStart={IconSend}
          loading={busy}
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
          data-testid="invite-share"
        >
          {t("share")}
        </Button>
        <p className="text-muted min-h-5 text-sm" aria-live="polite" data-testid="invite-share-outcome">
          {outcome === "idle" ? "" : t(`outcome.${outcome}`)}
        </p>
        <Button asChild variant="secondary" size="lg" block>
          <Link href="/visitors" data-testid="invite-done">
            {t("done")}
          </Link>
        </Button>
      </div>
    </div>
  );
}
