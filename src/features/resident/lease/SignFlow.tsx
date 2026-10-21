"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useRef, useState } from "react";

import { browserApi, unwrap } from "@/lib/api/browser";
import { newIdempotencyKey } from "@/lib/api/idempotency";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { ContractDownload, ResidentLease, SignatureOtp } from "@/lib/api/types";
import { openExternal } from "@/lib/liff/client";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Skeleton } from "@/ui/components/Skeleton";
import { lazyWarm } from "@/ui/lib/lazy";
import { IconBack } from "@/ui/icons/glyphs/back";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconExternal } from "@/ui/icons/glyphs/external";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconSign } from "@/ui/icons/glyphs/sign";

import { fitPng, SIGNATURE_MAX_BYTES } from "./signatureImage";

// The drawing pad and the code input are steps 2 and 3: loaded on the first tap or key press (D-179 budget), so the
// reading step — what the page opens on — ships without them.
const SignaturePad = lazyWarm(() => import("@/ui/components/SignaturePad").then((m) => m.SignaturePad));
const OTPInput = lazyWarm(() => import("@/ui/components/OTPInput").then((m) => m.OTPInput));
// The confirmation appears once the end of the lease has been reached — loaded then, not with the page.
const Checkbox = lazyWarm(() => import("@/ui/components/Checkbox").then((m) => m.Checkbox));

type Step = "read" | "draw" | "otp" | "done";
const STEPS: Step[] = ["read", "draw", "otp"];

const secondsUntil = (iso: string, now: number) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000));

/**
 * The resident's e-signature (D-062, L3 3.1 §2): read the lease to the end → draw the signature (or use a photo of
 * it — the dragging alternative, WCAG 2.5.7) → the SMS code to the phone the office recorded → signed, with the
 * sha256 of the document that was signed. The signature is sent with the OTP and the document hash the resident
 * opened (a changed document is refused with `lease.contract_changed` and the resident reads again); one
 * `Idempotency-Key` per attempt, reused when the same attempt is retried after a network failure.
 */
export function SignFlow({ lease, reader }: { lease: ResidentLease; reader: React.ReactNode }) {
  const t = useTranslations("resident.lease.sign");
  const [step, setStep] = useState<Step>("read");
  const [contract, setContract] = useState<ContractDownload | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [reachedEnd, setReachedEnd] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [signature, setSignature] = useState<Blob | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<SignatureOtp | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [signed, setSigned] = useState<{ lease: ResidentLease; sha256: string } | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const readerBox = useRef<HTMLDivElement>(null);

  // The document's hash is what the resident signs; fetched again when the office changed the document.
  const [contractRound, setContractRound] = useState(0);
  useEffect(() => {
    let alive = true;
    void browserApi
      .GET("/v1/resident/leases/{leaseId}/contract", { params: { path: { leaseId: lease.id } } })
      .then((result) => {
        if (!alive) return;
        try {
          setContract(unwrap(result));
        } catch (caught) {
          setError(toApiError(caught));
        }
      });
    return () => {
      alive = false;
    };
  }, [lease.id, contractRound]);

  // Move focus to the new step's heading, so screen readers and keyboards start at the top of each step.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.getElementById(`sign-${step}-title`)?.focus();
  }, [step]);

  // The scroll-to-end gate: the end marker of the reader must have been on screen once.
  useEffect(() => {
    if (step !== "read" || reachedEnd) return;
    const target = sentinel.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setReachedEnd(true);
      },
      { root: readerBox.current, threshold: 0.5 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [step, reachedEnd]);

  useEffect(() => {
    if (!challenge) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [challenge]);

  async function requestOtp() {
    setBusy(true);
    setError(null);
    try {
      const sent = unwrap(
        await browserApi.POST("/v1/resident/leases/{leaseId}/signature/otp", {
          params: { path: { leaseId: lease.id } },
          body: {},
        }),
      );
      setChallenge(sent);
      setCode("");
      setNow(Date.now());
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  // One submission at a time: a pasted code completes the input and may also arrive as a form submit.
  const inFlight = useRef(false);
  async function sign(value: string) {
    if (!challenge || !signature || !contract || value.length !== 6 || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const { blobToBase64 } = await import("@/ui/components/SignaturePad");
      const signaturePng = await blobToBase64(signature);
      // The same attempt (same challenge, code, document and signature) keeps its key across retries.
      const fingerprint = `${challenge.challengeId}:${value}:${contract.sha256}:${signaturePng.length}`;
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newIdempotencyKey() };
      const result = unwrap(
        await browserApi.POST("/v1/resident/leases/{leaseId}/sign", {
          params: { path: { leaseId: lease.id }, header: { "Idempotency-Key": attempt.current.key } },
          body: { challengeId: challenge.challengeId, code: value, contractSha256: contract.sha256, signaturePng },
        }),
      );
      setSigned({ lease: result, sha256: contract.sha256 });
      // No refresh here: this page would re-render as "nothing to sign" and replace the confirmation. The link
      // back to the lease loads it fresh.
      setStep("done");
    } catch (caught) {
      const problem = toApiError(caught);
      setError(problem);
      if (problem.code === "lease.contract_changed") {
        // The office changed the document since it was opened: read the new one, sign again.
        setChallenge(null);
        setReachedEnd(false);
        setConfirmed(false);
        setContract(null);
        setStep("read");
        setContractRound((round) => round + 1);
      } else if (problem.code === "auth.otp_invalid") {
        setCode("");
      } else if (problem.code === "auth.otp_expired" || problem.code === "auth.otp_attempts_exceeded") {
        setChallenge(null);
        setCode("");
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const index = STEPS.indexOf(step);
  const progress =
    step === "done" ? null : (
      <p className="text-muted text-sm" data-testid="sign-progress">
        {t("progress", { step: index + 1, total: STEPS.length })}
      </p>
    );
  const headingProps = { tabIndex: -1, className: "font-display text-2xl font-semibold outline-none" };

  if (step === "done" && signed) {
    const active = signed.lease.status === "active";
    return (
      <div className="flex flex-col gap-5 py-6" data-testid="sign-done">
        <h1 id="sign-done-title" {...headingProps}>
          {t("done.title")}
        </h1>
        <Callout tone="success" icon={IconCheckCircle} title={active ? t("done.activeTitle") : t("done.waitingTitle")}>
          {active ? t("done.activeBody") : t("done.waitingBody")}
        </Callout>
        <Card padding="md">
          <h2 className="text-sm font-semibold">{t("done.hashTitle")}</h2>
          <p className="text-muted mt-1 text-sm">{t("done.hashBody")}</p>
          <p className="mt-2 font-mono text-xs break-all" data-testid="sign-hash">
            {signed.sha256}
          </p>
        </Card>
        <Button asChild size="lg" block iconEnd={IconForward}>
          <Link href={`/lease/${lease.id}`}>{t("done.back")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 py-6" data-testid="sign-flow" data-step={step}>
      {step === "read" ? (
        <section className="flex flex-col gap-4" aria-labelledby="sign-read-title">
          <div className="flex flex-col gap-1">
            {progress}
            <h1 id="sign-read-title" {...headingProps}>
              {t("read.title")}
            </h1>
            <p className="text-muted">{t("read.lead")}</p>
          </div>
          <div
            ref={readerBox}
            tabIndex={0}
            role="region"
            aria-label={t("read.region")}
            className="rounded-card border-border bg-surface max-h-[50vh] overflow-y-auto border p-4"
            data-testid="sign-reader"
          >
            {reader}
            <p className="text-muted mt-4 text-sm">{t("read.binding")}</p>
            <div ref={sentinel} className="mt-2 text-sm font-medium" data-testid="sign-reader-end">
              {t("read.end")}
            </div>
          </div>
          <Button
            variant="secondary"
            size="lg"
            block
            iconStart={IconExternal}
            disabled={!contract}
            onClick={() => contract && void openExternal(contract.url)}
            data-testid="sign-open-document"
          >
            {t("read.openPdf")}
          </Button>
          {reachedEnd ? (
            <Suspense fallback={<Skeleton className="h-12 w-full" />}>
              <Checkbox
                label={t("read.confirm")}
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
                name="read"
              />
            </Suspense>
          ) : (
            <p className="text-muted text-sm" data-testid="sign-scroll-hint">
              {t("read.scrollHint")}
            </p>
          )}
          {error ? <ProblemCallout error={error} /> : null}
          <Button
            size="lg"
            block
            iconEnd={IconForward}
            disabled={!reachedEnd || !confirmed || !contract}
            onClick={() => {
              setError(null);
              setStep("draw");
            }}
            data-testid="sign-read-next"
          >
            {t("read.next")}
          </Button>
        </section>
      ) : null}

      {/* Kept mounted while hidden, so going back from the code step keeps the drawing. */}
      {step === "draw" || step === "otp" ? (
        <section className="flex flex-col gap-4" aria-labelledby="sign-draw-title" hidden={step !== "draw"}>
          <div className="flex flex-col gap-1">
            {progress}
            <h1 id="sign-draw-title" {...headingProps}>
              {t("draw.title")}
            </h1>
            <p className="text-muted">{t("draw.lead")}</p>
          </div>
          <Suspense fallback={<Skeleton className="h-60 w-full" />}>
            <SignaturePad
              label={t("draw.label")}
              labels={{
                placeholder: t("draw.placeholder"),
                clear: t("draw.clear"),
                undo: t("draw.undo"),
                upload: t("draw.upload"),
              }}
              onChange={async (png) => {
                setSignatureError(null);
                if (!png) {
                  setSignature(null);
                  return;
                }
                const fitted = await fitPng(png, SIGNATURE_MAX_BYTES);
                if (!fitted) {
                  setSignature(null);
                  setSignatureError(t("draw.tooLarge"));
                  return;
                }
                setSignature(fitted);
              }}
            />
          </Suspense>
          <p className="text-muted text-sm">{t("draw.uploadHint")}</p>
          {signatureError ? <Callout tone="warning">{signatureError}</Callout> : null}
          <div className="flex gap-2">
            <Button variant="ghost" size="lg" iconStart={IconBack} onClick={() => setStep("read")}>
              {t("back")}
            </Button>
            <Button
              size="lg"
              className="flex-1"
              iconEnd={IconForward}
              disabled={!signature}
              onClick={() => {
                setError(null);
                setStep("otp");
                if (!challenge) void requestOtp();
              }}
              data-testid="sign-draw-next"
            >
              {t("draw.next")}
            </Button>
          </div>
        </section>
      ) : null}

      {step === "otp" ? (
        <form
          className="flex flex-col gap-4"
          aria-labelledby="sign-otp-title"
          onSubmit={(event) => {
            event.preventDefault();
            void sign(code);
          }}
        >
          <div className="flex flex-col gap-1">
            {progress}
            <h1 id="sign-otp-title" {...headingProps}>
              {t("otp.title")}
            </h1>
            <p className="text-muted" data-testid="sign-otp-lead">
              {challenge ? t("otp.lead", { phone: challenge.phoneMasked }) : t("otp.sending")}
            </p>
          </div>
          <Suspense fallback={<Skeleton className="h-14 w-full" />}>
            <OTPInput
              value={code}
              onChange={setCode}
              onComplete={(value) => void sign(value)}
              digitLabel={(i) => t("otp.digit", { index: i + 1 })}
              disabled={!challenge || busy}
            />
          </Suspense>
          {error && error.code === "auth.otp_invalid" && typeof error.problem.attemptsRemaining === "number" ? (
            <Callout tone="danger">{t("otp.wrong", { count: error.problem.attemptsRemaining })}</Callout>
          ) : error ? (
            <ProblemCallout error={error} />
          ) : null}
          <Button
            type="submit"
            size="lg"
            block
            loading={busy && !!challenge}
            disabled={!challenge || code.length !== 6}
            iconStart={IconSign}
            data-testid="sign-submit"
          >
            {t("otp.submit")}
          </Button>
          <div className="flex flex-col items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={busy || (challenge ? secondsUntil(challenge.resendAvailableAt, now) > 0 : false)}
              onClick={() => void requestOtp()}
              data-testid="sign-otp-resend"
            >
              {challenge && secondsUntil(challenge.resendAvailableAt, now) > 0
                ? t("otp.resendIn", { seconds: secondsUntil(challenge.resendAvailableAt, now) })
                : t("otp.resend")}
            </Button>
            <Button type="button" variant="ghost" iconStart={IconBack} onClick={() => setStep("draw")}>
              {t("back")}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
