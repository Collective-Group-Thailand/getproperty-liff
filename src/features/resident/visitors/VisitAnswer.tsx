"use client";

import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import type { Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { ResidentVisit } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { LazyAlertDialog } from "@/ui/components/overlays";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconLogOut } from "@/ui/icons/glyphs/log-out";
import { IconPhone } from "@/ui/icons/glyphs/phone";
import { IconXCircle } from "@/ui/icons/glyphs/x-circle";

import { deepLinkStep, plateText, resultOf, type Answer } from "./model";
import { useClockTime } from "./clockTime";

/** The result card loads when a visit has been answered (a waiting visit's page stays light, D-179). */
const VisitResultCard = dynamic(() => import("./VisitParts").then((m) => m.VisitResultCard));

function post(answer: Answer, visitId: string, rememberVehicle: boolean) {
  const params = { path: { visitId } };
  if (answer === "approve") {
    return browserApi.POST("/v1/resident/visits/{visitId}/actions/approve", { params, body: { rememberVehicle } });
  }
  if (answer === "deny") return browserApi.POST("/v1/resident/visits/{visitId}/actions/deny", { params });
  return browserApi.POST("/v1/resident/visits/{visitId}/actions/call-me", { params });
}

/**
 * The household's answer to a visitor at the gate (D-315, D-327): filled "let in", outlined "ask the guard to call me",
 * outlined danger "do not let in", and "remember this car" (unticked — remembering a stranger's car is the resident's
 * choice, never the default). First answer wins: when another member was first the API says `accepted: false` and
 * this turns into the result card naming who answered. A LINE button (`?answer=`) only ever opens the confirmation —
 * the link itself never acts (a link preview, a forwarded message or a mistaken tap must not open the gate).
 */
export function VisitAnswer({
  visit: initial,
  me,
  answer: linked,
  rememberDays,
  minutes,
  locale,
}: {
  visit: ResidentVisit;
  me: string;
  answer: Answer | null;
  rememberDays: number | null;
  minutes: number;
  locale: Locale;
}) {
  const t = useTranslations("resident.visitors.visit");
  const router = useRouter();
  const time = useClockTime(locale);
  const [visit, setVisit] = useState(initial);
  const [seen, setSeen] = useState(initial);
  // A fresh server render (realtime, the poll, the clock running out) brings a newer visit.
  if (seen !== initial) {
    setSeen(initial);
    setVisit(initial);
  }
  const [accepted, setAccepted] = useState<boolean | undefined>(undefined);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState<Answer | "exit" | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  // The LINE button's answer opens the confirmation (never acts); a visit already answered says so instead.
  const [confirm, setConfirm] = useState<Answer | null>(() =>
    deepLinkStep(linked, initial.state) === "confirm" ? linked : null,
  );
  const linkAnswered = deepLinkStep(linked, initial.state) === "answered";

  useEffect(() => {
    // Drop `?answer=` so a reload or the back button never asks again.
    if (linked) window.history.replaceState(window.history.state, "", window.location.pathname);
  }, [linked]);

  async function send(answer: Answer) {
    setBusy(answer);
    setError(null);
    try {
      const result = unwrap(await post(answer, visit.id, Boolean(visit.plate) && remember));
      setVisit(result.visit);
      setAccepted(result.accepted);
      setConfirm(null);
      router.refresh();
    } catch (caught) {
      setConfirm(null);
      setError(toApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  async function exit() {
    setBusy("exit");
    setError(null);
    try {
      setVisit(
        unwrap(
          await browserApi.POST("/v1/resident/visits/{visitId}/actions/exit", {
            params: { path: { visitId: visit.id } },
          }),
        ),
      );
      router.refresh();
    } catch (caught) {
      const problem = toApiError(caught);
      if (problem.code === "visit.invalid_state") router.refresh();
      setError(problem);
    } finally {
      setBusy(null);
    }
  }

  const result = resultOf(visit, accepted);
  const plate = plateText(visit.plate);
  const confirmWords = confirm
    ? {
        title: plate ? t(`confirm.${confirm}.title`, { plate }) : t(`confirm.${confirm}.titleNoPlate`),
        body: t(`confirm.${confirm}.body`, { gate: visit.gateName }),
        label: t(`confirm.${confirm}.confirm`),
      }
    : null;

  return (
    <div className="flex flex-col gap-4" data-testid="visit-answer" data-state={visit.state}>
      {linkAnswered ? (
        <div data-testid="visit-link-answered">
          <Callout tone="info" size="sm">
            {t("linkAnswered")}
          </Callout>
        </div>
      ) : null}
      {error ? <ProblemCallout error={error} /> : null}

      {result.kind === "waiting" || result.kind === "call_me" ? (
        <>
          <div className="flex flex-col gap-3" data-testid="visit-actions">
            <Button
              size="lg"
              block
              iconStart={IconCheckCircle}
              loading={busy === "approve"}
              disabled={busy !== null}
              onClick={() => void send("approve")}
              data-testid="visit-approve"
            >
              {t("approve")}
            </Button>
            {result.kind === "call_me" ? (
              <p className="text-muted rounded-control bg-bg-subtle px-4 py-3 text-sm" data-testid="visit-called">
                {t("calledNote", { time: time(result.at) })}
              </p>
            ) : (
              <Button
                variant="secondary"
                size="lg"
                block
                iconStart={IconPhone}
                loading={busy === "call_me"}
                disabled={busy !== null}
                onClick={() => void send("call_me")}
                data-testid="visit-call-me"
              >
                {t("callMe")}
              </Button>
            )}
            <Button
              variant="destructive"
              size="lg"
              block
              iconStart={IconXCircle}
              loading={busy === "deny"}
              disabled={busy !== null}
              onClick={() => void send("deny")}
              data-testid="visit-deny"
            >
              {t("deny")}
            </Button>
          </div>
          {plate ? (
            <div className="border-border border-t pt-4">
              {/* A native checkbox (the shared Radix one would add weight to the page the LINE message opens). */}
              <label className="flex min-h-11 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="accent-primary mt-1 size-5 shrink-0"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  aria-describedby="visit-remember-hint"
                  data-testid="visit-remember"
                />
                <span className="flex flex-col">
                  <span>{rememberDays ? t("remember", { days: rememberDays }) : t("rememberNoDays")}</span>
                  <span id="visit-remember-hint" className="text-muted text-sm">
                    {t("rememberHint")}
                  </span>
                </span>
              </label>
            </div>
          ) : null}
        </>
      ) : (
        <VisitResultCard visit={visit} result={result} me={me} minutes={minutes} locale={locale}>
          <div className="flex flex-col gap-2">
            {visit.state === "entered" ? (
              <Button
                variant="secondary"
                size="lg"
                block
                iconStart={IconLogOut}
                loading={busy === "exit"}
                onClick={() => void exit()}
                data-testid="visit-exit"
              >
                {t("result.markExit")}
              </Button>
            ) : null}
            <Link
              href="/visitors"
              className="text-primary inline-flex min-h-11 items-center self-start text-sm font-medium"
              data-testid="visit-all"
            >
              {t("result.all")}
            </Link>
          </div>
        </VisitResultCard>
      )}

      <LazyAlertDialog
        open={confirm !== null}
        onOpenChange={(open) => (open ? null : setConfirm(null))}
        title={confirmWords?.title ?? ""}
        description={confirmWords?.body ?? ""}
        confirmLabel={confirmWords?.label ?? ""}
        cancelLabel={t("confirm.cancel")}
        tone={confirm === "deny" ? "destructive" : "primary"}
        loading={busy !== null}
        onConfirm={() => (confirm ? void send(confirm) : undefined)}
      />
    </div>
  );
}
