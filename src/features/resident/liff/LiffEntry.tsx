"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale, localeFromLanguageTag } from "@/i18n/routing";
import { afterResidentSignIn } from "@/lib/auth/afterSignIn";
import { exchangeLineIdToken } from "@/lib/auth/client";
import {
  getLiff,
  isLiffMocked,
  liffId,
  runLiffEntry,
  type LiffEntryResult,
  type LiffExchange,
  type LiffStepName,
  type LiffStepState,
} from "@/lib/liff";
import { rememberLiffContext } from "@/lib/observability/liffContext";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import type { IconName } from "@/ui/icons";

const STEPS: LiffStepName[] = ["init", "login", "session", "link"];

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

/** The BFF exchange in the shape the entry sequence wants; the id token is only passed through. */
const exchange: LiffExchange = async (idToken, audience) => {
  const result = await exchangeLineIdToken(idToken, audience);
  if (result.ok) return { ok: true };
  return {
    ok: false,
    code: result.error.code,
    message: result.error.detail || result.error.code,
    ...(result.error.requestId ? { requestId: result.error.requestId } : {}),
  };
};

/**
 * The LIFF endpoint (`/liff`, ADR-0006): shows init → LINE login → getproperty sign-in → deep link as each step
 * happens, then replaces itself with the target (the consent screen first when required consents are missing).
 */
export function LiffEntry({ technicianEnabled }: { technicianEnabled: boolean }) {
  const t = useTranslations("resident.liff");
  const common = useTranslations("common");
  const router = useRouter();
  const [steps, setSteps] = useState<Record<LiffStepName, LiffStepState>>({
    init: "pending",
    login: "pending",
    session: "pending",
    link: "pending",
  });
  const [result, setResult] = useState<LiffEntryResult | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const liff = await getLiff();
      const outcome = await runLiffEntry(liff, {
        liffId: liffId(),
        search: window.location.search,
        redirectUri: window.location.href,
        exchange,
        technicianEnabled,
        onStep: (step, state) => {
          if (!cancelled) setSteps((current) => ({ ...current, [step]: state }));
        },
      });
      if (cancelled) return;
      if (outcome.status === "ready") {
        rememberLineLanguage(liff.getLanguage());
        rememberLiffContext({ inClient: outcome.inClient, os: liff.getOS() ?? "unknown" });
        const next = outcome.audience === "resident" ? await afterResidentSignIn(outcome.target) : outcome.target;
        if (cancelled) return;
        setTarget(next);
        setResult(outcome);
        router.replace(next);
        return;
      }
      setResult(outcome);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, technicianEnabled]);

  const errorBody =
    result?.status === "error"
      ? result.code === "auth.account_disabled"
        ? t("accountDisabled")
        : result.code === "auth.line_token_invalid"
          ? t("tokenInvalid")
          : t("errorBody")
      : null;

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

      {result?.status === "ready" && target ? (
        <>
          {result.inClient ? null : <Callout tone="neutral">{t("outsideLine")}</Callout>}
          <Button asChild size="lg" block iconEnd="forward">
            <Link href={target} replace data-testid="liff-continue">
              {t("continue")}
            </Link>
          </Button>
        </>
      ) : null}

      {result?.status === "error" ? (
        <>
          <Callout tone="danger" title={t("error")}>
            <span>{errorBody}</span>
            {result.requestId ? (
              <span className="mt-1 block font-mono text-xs">
                {common("requestId")}: {result.requestId}
              </span>
            ) : null}
          </Callout>
          <Button size="lg" block iconStart="refresh" onClick={() => window.location.reload()}>
            {common("retry")}
          </Button>
          <Button asChild variant="ghost" block>
            <Link href="/auth">{t("useSms")}</Link>
          </Button>
        </>
      ) : null}
    </div>
  );
}
