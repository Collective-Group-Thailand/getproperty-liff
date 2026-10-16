"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale, localeFromLanguageTag } from "@/i18n/routing";
import {
  getLiff,
  isLiffMocked,
  liffId,
  runLiffEntry,
  type LiffEntryResult,
  type LiffStepName,
  type LiffStepState,
} from "@/lib/liff";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import type { IconName } from "@/ui/icons";

const STEPS: LiffStepName[] = ["init", "login", "link"];

const STATE_LOOK: Record<LiffStepState, { tone: "neutral" | "info" | "success" | "danger"; icon: IconName }> = {
  pending: { tone: "neutral", icon: "dot" },
  running: { tone: "info", icon: "spinner" },
  done: { tone: "success", icon: "check" },
  failed: { tone: "danger", icon: "alert" },
};

/** Writes `gp_locale` from LINE's language on first open, so the next server render speaks it. */
function rememberLineLanguage(tag: string) {
  const existing = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`))?.[1];
  if (isLocale(existing)) return;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${localeFromLanguageTag(tag)}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax${secure}`;
}

/**
 * The LIFF endpoint (L0 placeholder of L1's flow): shows each step of init → login → deep link as it
 * happens, then offers the target. L1 adds the id-token exchange through the BFF and replaces the
 * "continue" link with an automatic `router.replace(target)`.
 */
export function LiffEntry() {
  const t = useTranslations("resident.liff");
  const [steps, setSteps] = useState<Record<LiffStepName, LiffStepState>>({
    init: "pending",
    login: "pending",
    link: "pending",
  });
  const [result, setResult] = useState<LiffEntryResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const liff = await getLiff();
      const outcome = await runLiffEntry(liff, {
        liffId: liffId(),
        search: window.location.search,
        redirectUri: window.location.href,
        onStep: (step, state) => {
          if (!cancelled) setSteps((current) => ({ ...current, [step]: state }));
        },
      });
      if (outcome.status === "ready") rememberLineLanguage(liff.getLanguage());
      if (!cancelled) setResult(outcome);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-5 py-6" data-testid="liff-entry" data-status={result?.status ?? "running"}>
      <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
      {isLiffMocked() ? <Callout tone="info">{t("mock")}</Callout> : null}

      <ol className="flex flex-col gap-3" aria-live="polite">
        {STEPS.map((step) => {
          const look = STATE_LOOK[steps[step]];
          return (
            <li
              key={step}
              className="flex items-center justify-between gap-3"
              data-step={step}
              data-state={steps[step]}
            >
              <span>{t(`steps.${step}`)}</span>
              <Badge tone={look.tone} icon={look.icon} size="sm">
                {t(`state.${steps[step]}`)}
              </Badge>
            </li>
          );
        })}
      </ol>

      {result?.status === "ready" ? (
        <>
          {result.inClient ? null : <Callout tone="neutral">{t("outsideLine")}</Callout>}
          <Button asChild size="lg" block iconEnd="forward">
            <Link href={result.target} data-testid="liff-continue">
              {t("continue")}
            </Link>
          </Button>
        </>
      ) : null}

      {result?.status === "error" ? (
        <Callout tone="danger" title={t("error")}>
          {t("errorBody")}
        </Callout>
      ) : null}
    </div>
  );
}
