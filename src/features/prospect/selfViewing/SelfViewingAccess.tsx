"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatDateTime, formatTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { useIdempotentAttempt } from "@/lib/api/attempt";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { LazyAlertDialog, LazySheet } from "@/ui/components/overlays";

import { AccessView, type AccessIntent } from "./AccessView";
import { msUntil } from "./model";

type Viewing = Schemas["LeadViewingDto"];
type Code = Schemas["ViewingAccessCodeDto"];

/**
 * The working door-code panel of a confirmed self viewing (GL2, D-295), loaded on the first tap of the light panel
 * (`LazySelfViewingAccess`), which hands over what was tapped (`intent`). The code is **fetched on tap**
 * (`cache: "no-store"`; the BFF and the API answer `no-store`, the service worker never handles `/bff/*`), kept only
 * in this component's state — never in a query cache, storage, the URL or logs — and dropped when the page is hidden
 * or left, when the window closes and on *hide*. Then: *I'm inside* (arrive), *I've left* (leave — the codes stop at
 * once) and *report a problem* (once, a work order for the owner); one Idempotency-Key per logical action.
 */
export function SelfViewingAccess({
  viewing,
  intent,
}: {
  viewing: Viewing & { access: NonNullable<Viewing["access"]> };
  intent: AccessIntent;
}) {
  const t = useTranslations("prospect.selfViewing.access");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const access = viewing.access;
  const [now, setNow] = useState(() => Date.now());
  const [code, setCode] = useState<Code | null>(null);
  const [busy, setBusy] = useState<AccessIntent | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState("");
  const arriveAttempt = useIdempotentAttempt<null>();
  const leaveAttempt = useIdempotentAttempt<null>();
  const incidentAttempt = useIdempotentAttempt<{ note: string }>();
  const path = { viewingId: viewing.id };

  // The phase follows the clock (the window opens / closes while the page is open).
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  // The code never outlives the moment: hidden page, page left, window over.
  useEffect(() => {
    if (!code) return;
    const drop = () => setCode(null);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") drop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", drop);
    const expiry = window.setTimeout(drop, msUntil(code.validTo));
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", drop);
      window.clearTimeout(expiry);
    };
  }, [code]);

  async function showCode() {
    setBusy("code");
    setError(null);
    try {
      setCode(
        unwrap(
          await browserApi.GET("/v1/prospect/viewings/{viewingId}/access-code", {
            params: { path },
            cache: "no-store",
          }),
        ),
      );
    } catch (caught) {
      setError(toApiError(caught));
      setNow(Date.now());
    } finally {
      setBusy(null);
    }
  }

  async function arrive() {
    setBusy("arrive");
    setError(null);
    try {
      const { key } = await arriveAttempt.prepare({ viewing: viewing.id, action: "arrive" }, () => null);
      unwrap(
        await browserApi.POST("/v1/prospect/viewings/{viewingId}/actions/arrive", {
          params: { path, header: { "Idempotency-Key": key } },
        }),
      );
      arriveAttempt.succeeded();
      router.refresh();
    } catch (caught) {
      const problem = toApiError(caught);
      arriveAttempt.failed(problem);
      setError(problem);
    } finally {
      setBusy(null);
    }
  }

  async function leave() {
    setBusy("leave");
    setError(null);
    try {
      const { key } = await leaveAttempt.prepare({ viewing: viewing.id, action: "leave" }, () => null);
      unwrap(
        await browserApi.POST("/v1/prospect/viewings/{viewingId}/actions/leave", {
          params: { path, header: { "Idempotency-Key": key } },
        }),
      );
      leaveAttempt.succeeded();
      setCode(null);
      setLeaving(false);
      router.replace(`${window.location.pathname}?done=left`);
      router.refresh();
    } catch (caught) {
      const problem = toApiError(caught);
      leaveAttempt.failed(problem);
      setLeaving(false);
      setError(problem);
    } finally {
      setBusy(null);
    }
  }

  async function report() {
    const text = note.trim();
    if (text.length < 3) return;
    setBusy("report");
    setError(null);
    try {
      const { key, body } = await incidentAttempt.prepare({ viewing: viewing.id, note: text }, () => ({ note: text }));
      unwrap(
        await browserApi.POST("/v1/prospect/viewings/{viewingId}/actions/report-incident", {
          params: { path, header: { "Idempotency-Key": key } },
          body,
        }),
      );
      incidentAttempt.succeeded();
      setReporting(false);
      setNote("");
      router.refresh();
    } catch (caught) {
      const problem = toApiError(caught);
      incidentAttempt.failed(problem);
      setError(problem);
    } finally {
      setBusy(null);
    }
  }

  function act(next: AccessIntent) {
    if (next === "code") void showCode();
    else if (next === "arrive") void arrive();
    else if (next === "leave") setLeaving(true);
    else setReporting(true);
  }

  // What the person tapped on the light panel runs once, as if this panel had been here all along.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    act(intent);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  // `viewing.code_not_available` carries the window (`codeValidFrom` / `codeValidTo`); else the one we know.
  const windowOf = (field: "codeValidFrom" | "codeValidTo", fallback: string) => {
    const value = error?.problem[field];
    return typeof value === "string" ? value : fallback;
  };
  const notice =
    error?.code === "viewing.code_not_available" ? (
      <Callout tone="info" title={t("notYetTitle")}>
        {t("notYet", {
          from: formatDateTime(windowOf("codeValidFrom", access.validFrom), locale),
          to: formatTime(windowOf("codeValidTo", access.validTo), locale),
        })}
      </Callout>
    ) : error && !reporting ? (
      <ProblemCallout error={error} />
    ) : null;

  return (
    <>
      <AccessView
        access={access}
        now={now}
        code={code}
        busy={busy === "report" || busy === "leave" ? null : busy}
        onAction={act}
        onHide={() => setCode(null)}
        notice={notice}
      />

      <LazyAlertDialog
        open={leaving}
        onOpenChange={(next) => {
          if (busy !== "leave") setLeaving(next);
        }}
        title={t("leaveTitle")}
        description={t("leaveBody")}
        confirmLabel={t("leaveConfirm")}
        cancelLabel={t("leaveCancel")}
        loading={busy === "leave"}
        onConfirm={() => void leave()}
      />

      <LazySheet
        open={reporting}
        onOpenChange={(next) => {
          if (busy !== "report") setReporting(next);
        }}
        title={t("reportTitle")}
        closeLabel={t("close")}
        side="bottom"
        footer={
          <Button
            size="lg"
            block
            loading={busy === "report"}
            disabled={note.trim().length < 3}
            onClick={() => void report()}
            data-testid="self-report-send"
          >
            {t("reportSend")}
          </Button>
        }
      >
        <div className="flex flex-col gap-3 px-5 pb-4">
          <p className="text-muted text-sm">{t("reportBody")}</p>
          <Field label={t("reportLabel")} required>
            <Textarea
              rows={4}
              maxLength={2000}
              value={note}
              placeholder={t("reportPlaceholder")}
              onChange={(event) => setNote(event.target.value)}
              data-testid="self-report-note"
            />
          </Field>
          {error && reporting ? <ProblemCallout error={error} /> : null}
        </div>
      </LazySheet>
    </>
  );
}
