"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { inLineClient } from "@/lib/liff/client";
import { pushSupported, subscribeToPush } from "@/lib/pwa/push";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { IconBell } from "@/ui/icons/glyphs/bell";

/** Set once the offer was shown in this browser: it is made once, after the first payment, never again. */
export const PUSH_OFFER_KEY = "gp_push_offer";

function offeredBefore(): boolean {
  try {
    return localStorage.getItem(PUSH_OFFER_KEY) !== null;
  } catch {
    return true;
  }
}

function remember(answer: string): void {
  try {
    localStorage.setItem(PUSH_OFFER_KEY, answer);
  } catch {
    // Private mode: the offer may come back once more; nothing else depends on it.
  }
}

/**
 * The web-push offer (L1 1.3 §4, L2): after the resident's first payment — a moment the next "your invoice is
 * ready" is clearly useful — never on first open. Only outside LINE (LINE messages already reach the resident
 * there), where the browser can push, a VAPID key is configured and the permission was never asked.
 */
export function PushOffer({ vapidKey }: { vapidKey?: string }) {
  const t = useTranslations("resident.pay.push");
  const [state, setState] = useState<"hidden" | "offer" | "busy" | "on" | "denied" | "failed">("hidden");

  useEffect(() => {
    let alive = true;
    void inLineClient().then((inLine) => {
      if (!alive) return;
      if (!pushSupported(vapidKey, inLine) || Notification.permission !== "default" || offeredBefore()) return;
      remember("shown");
      setState("offer");
    });
    return () => {
      alive = false;
    };
  }, [vapidKey]);

  if (state === "hidden") return null;
  return (
    <Card
      as="section"
      padding="md"
      className="w-full text-start"
      aria-labelledby="push-offer-title"
      data-testid="push-offer"
    >
      <h4 id="push-offer-title" className="font-semibold">
        {t("title")}
      </h4>
      <p className="text-muted mt-1 text-sm" aria-live="polite">
        {state === "on" ? t("on") : state === "denied" ? t("denied") : state === "failed" ? t("failed") : t("body")}
      </p>
      {state === "offer" || state === "busy" ? (
        <div className="mt-3 flex flex-col gap-2">
          <Button
            size="lg"
            block
            iconStart={IconBell}
            loading={state === "busy"}
            data-testid="push-offer-accept"
            onClick={async () => {
              if (!vapidKey) return;
              setState("busy");
              const result = await subscribeToPush(vapidKey);
              remember(result);
              setState(result === "subscribed" ? "on" : result);
            }}
          >
            {t("accept")}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            block
            onClick={() => {
              remember("declined");
              setState("hidden");
            }}
          >
            {t("decline")}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
