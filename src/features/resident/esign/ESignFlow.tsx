"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useTransition } from "react";

import { newIdempotencyKey } from "@/lib/api/idempotency";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { ContractDownload, SignatureOtp } from "@/lib/api/types";
import { openExternal } from "@/lib/liff/client";
import { fitPng, SIGNATURE_MAX_BYTES } from "@/features/resident/lease/signatureImage";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Skeleton } from "@/ui/components/Skeleton";
import { lazyWarm } from "@/ui/lib/lazy";
import { IconBack } from "@/ui/icons/glyphs/back";
import { IconExternal } from "@/ui/icons/glyphs/external";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconSign } from "@/ui/icons/glyphs/sign";

// The drawing pad and the code input are steps 2 and 3: loaded on the first tap or key press (D-179 budget), so the
// reading step — what the page opens on — ships without them.
const SignaturePad = lazyWarm(() => import("@/ui/components/SignaturePad").then((m) => m.SignaturePad));
const OTPInput = lazyWarm(() => import("@/ui/components/OTPInput").then((m) => m.OTPInput));
// The confirmation appears once the end of the document has been reached — loaded then, not with the page.
const Checkbox = lazyWarm(() => import("@/ui/components/Checkbox").then((m) => m.Checkbox));

type Step = "read" | "draw" | "otp" | "done";
const STEPS: Step[] = ["read", "draw", "otp"];

const secondsUntil = (iso: string, now: number) => Math.max(0, Math.ceil((Date.parse(iso) - now) / 1000));
const sameHash = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
/** How many times the reader is rendered again for a document that keeps changing before the flow gives up. */
const MAX_SYNC_ROUNDS = 3;

/**
 * The identity of one signing attempt (same challenge, code, document and drawn signature): the PNG's own sha256, so
 * two different drawings never share an `Idempotency-Key` — even when their base64 happens to have the same length.
 */
export async function attemptFingerprint(input: SignInput): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.signaturePng));
  const png = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${input.challengeId}:${input.code}:${input.contractSha256.toLowerCase()}:${png}`;
}

/** What the resident sends with the signature (D-062): the OTP, the sha256 of the PDF read, the drawn PNG. */
export interface SignInput {
  challengeId: string;
  code: string;
  contractSha256: string;
  signaturePng: string;
}

/** The copy namespaces with the sign-flow keys (`progress`, `back`, `read.*`, `draw.*`, `otp.*`, `done.*`). */
export type SignNamespace = "resident.lease.sign" | "resident.contracts.sign";

/**
 * The resident's e-signature (D-062), for a lease (L3 3.1 §2) and for a signable document of the contract library
 * (GL3, D-294): read the document to the end → draw the signature (or use a photo of it — the dragging alternative,
 * WCAG 2.5.7) → the SMS code to the phone the office recorded → signed, with the sha256 of the document that was
 * signed. The signature goes with the OTP and the document hash the resident opened (a changed document is refused
 * with `changedCode` and the resident reads again); one `Idempotency-Key` per attempt, reused when the same attempt
 * is retried after a network failure. The calls are the caller's (`loadDocument`, `requestOtp`, `submit`).
 *
 * What is read, drawn and signed is one version of the document (review G, M1 / M2):
 * - the server-rendered `reader` must show the version whose hash is signed: when the page knows the hash it rendered
 *   for (`renderedSha256`) and it equals the loaded document's, the reader is current; otherwise the page is rendered
 *   again (`router.refresh()`, the flow keeps its state) and *Next* waits for it — a reader rendered for yet another
 *   version loads the document again. Without a rendered hash (a lease) the page is rendered again after every load,
 *   so the reader is never older than the hash (a newer one is refused by the API with `changedCode`);
 * - a drawing belongs to one reading: going back to read (or a changed document) drops it, so the pad and what is
 *   sent never differ;
 * - *Open the PDF* fetches the document on every tap (its URL is valid 5 minutes, D-294); another hash there is a
 *   changed document.
 */
export function ESignFlow<R>({
  namespace,
  reader,
  loadDocument,
  requestOtp: sendOtp,
  submit,
  changedCode,
  alreadySignedCode,
  renderedSha256,
  renderDone,
}: {
  namespace: SignNamespace;
  reader: React.ReactNode;
  /** The sha256 of the version the server rendered `reader` for, when the page knows it (`ContractDto.sha256`). */
  renderedSha256?: string | null;
  loadDocument: () => Promise<ContractDownload>;
  requestOtp: () => Promise<SignatureOtp>;
  submit: (input: SignInput, idempotencyKey: string) => Promise<R>;
  /** The problem code that means "the document changed since you opened it". */
  changedCode: string;
  /** The problem code that means "already signed" (a retry after a lost answer): the page is rendered again. */
  alreadySignedCode: string;
  /** The confirmation under the "signed" heading and above the document fingerprint. */
  renderDone: (result: R) => { callout: React.ReactNode; actions: React.ReactNode };
}) {
  const t = useTranslations(namespace);
  const router = useRouter();
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
  const [signed, setSigned] = useState<{ result: R; sha256: string } | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const readerBox = useRef<HTMLDivElement>(null);
  // The document loader of the first render: its target (a lease, a document) never changes on this page.
  const [load] = useState(() => loadDocument);

  // Whether the reader on screen shows the version of the hash held (*Next* waits until it does):
  // - with a rendered hash (contracts) it is derived: the two hashes are equal;
  // - without one (a lease) the page is rendered again after the hash is read: `awaiting` holds that hash until the
  //   refresh settles, `readerFor` then names it.
  const known = renderedSha256 ?? null;
  const [readerFor, setReaderFor] = useState<string | null>(null);
  const [awaiting, setAwaiting] = useState<string | null>(null);
  // The document changed under the resident (said on the reading step).
  const [updated, setUpdated] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const rendered = useRef(known);
  useEffect(() => {
    rendered.current = known;
  });
  const syncRounds = useRef(0);

  // The document's hash is what the resident signs; fetched again when the office changed the document.
  const [contractRound, setContractRound] = useState(0);
  useEffect(() => {
    let alive = true;
    void load()
      .then((document) => {
        if (!alive) return;
        setContract(document);
        const current = rendered.current;
        if (current && sameHash(current, document.sha256)) return;
        // The reader was rendered before this hash was read (or for another version): render the page again.
        if (current) setUpdated(true);
        if (syncRounds.current >= MAX_SYNC_ROUNDS) return;
        syncRounds.current += 1;
        setAwaiting(document.sha256);
        startRefresh(() => router.refresh());
      })
      .catch((caught: unknown) => {
        if (alive) setError(toApiError(caught));
      });
    return () => {
      alive = false;
    };
    // `router` is stable; the rendered hash is read through its ref when the document arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, contractRound]);

  // Read the document again from the start: a changed document (the API's `changedCode`, a new hash on open, a reader
  // rendered for another version). The drawing and the code belong to the old one.
  function reread() {
    setChallenge(null);
    setCode("");
    setReachedEnd(false);
    setConfirmed(false);
    setSignature(null);
    setSignatureError(null);
    setContract(null);
    setReaderFor(null);
    setAwaiting(null);
    setStep("read");
    setContractRound((round) => round + 1);
  }

  // The page was rendered again (adjusted while rendering, React's "previous render" pattern):
  // - a reader for another version is new text — the reading starts again — and when it is not the version of the
  //   hash held, the office changed the document meanwhile: load it again;
  // - the refresh settled: without a rendered hash the reader is now no older than the hash held.
  const [seenRendered, setSeenRendered] = useState(known);
  if (known !== seenRendered) {
    setSeenRendered(known);
    setReachedEnd(false);
    setConfirmed(false);
    if (known && contract && !sameHash(known, contract.sha256)) {
      setUpdated(true);
      reread();
    }
  }
  const [seenRefreshing, setSeenRefreshing] = useState(refreshing);
  if (refreshing !== seenRefreshing) {
    setSeenRefreshing(refreshing);
    if (!refreshing && awaiting) {
      setAwaiting(null);
      setReaderFor(awaiting);
    }
  }

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
      setChallenge(await sendOtp());
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
      const input: SignInput = {
        challengeId: challenge.challengeId,
        code: value,
        contractSha256: contract.sha256,
        signaturePng,
      };
      // The same attempt (same challenge, code, document and signature) keeps its key across retries.
      const fingerprint = await attemptFingerprint(input);
      if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: newIdempotencyKey() };
      const result = await submit(input, attempt.current.key);
      setSigned({ result, sha256: contract.sha256 });
      // No refresh here: this page would re-render as "nothing to sign" and replace the confirmation. The link
      // back loads the document fresh.
      setStep("done");
    } catch (caught) {
      const problem = toApiError(caught);
      setError(problem);
      if (problem.code === "idempotency.key_reused") {
        // The key went with another body: the next try is a new attempt.
        attempt.current = null;
      } else if (problem.code === changedCode) {
        // The office changed the document since it was opened: read the new one (the page renders it again), sign
        // again with a new drawing.
        syncRounds.current = 0;
        reread();
      } else if (problem.code === alreadySignedCode) {
        // Signed already (an earlier try went through): the page shows it.
        router.refresh();
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

  // The signed URL lives 5 minutes (D-294): fetched again on every tap. The hash read stays the one to sign; another
  // hash means the office changed the document — read it again.
  const [opening, setOpening] = useState(false);
  async function openDocument() {
    if (!contract) return;
    setOpening(true);
    setError(null);
    try {
      const fresh = await load();
      if (!sameHash(fresh.sha256, contract.sha256)) {
        setUpdated(true);
        syncRounds.current = 0;
        reread();
        return;
      }
      await openExternal(fresh.url);
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setOpening(false);
    }
  }

  const readerReady =
    contract !== null &&
    (known ? sameHash(known, contract.sha256) : readerFor !== null && sameHash(readerFor, contract.sha256));
  const index = STEPS.indexOf(step);
  const progress =
    step === "done" ? null : (
      <p className="text-muted text-sm" data-testid="sign-progress">
        {t("progress", { step: index + 1, total: STEPS.length })}
      </p>
    );
  const headingProps = { tabIndex: -1, className: "font-display text-2xl font-semibold outline-none" };

  if (step === "done" && signed) {
    const done = renderDone(signed.result);
    return (
      <div className="flex flex-col gap-5 py-6" data-testid="sign-done">
        <h1 id="sign-done-title" {...headingProps}>
          {t("done.title")}
        </h1>
        {done.callout}
        <Card padding="md">
          <h2 className="text-sm font-semibold">{t("done.hashTitle")}</h2>
          <p className="text-muted mt-1 text-sm">{t("done.hashBody")}</p>
          <p className="mt-2 font-mono text-xs break-all" data-testid="sign-hash">
            {signed.sha256}
          </p>
        </Card>
        {done.actions}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-5 py-6"
      data-testid="sign-flow"
      data-step={step}
      data-reader={readerReady ? "current" : "pending"}
    >
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
            loading={opening}
            onClick={() => void openDocument()}
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
          {updated && !error ? (
            <div role="status" data-testid="sign-updated">
              <Callout tone="info">{t("read.updated")}</Callout>
            </div>
          ) : null}
          {error ? <ProblemCallout error={error} /> : null}
          <Button
            size="lg"
            block
            iconEnd={IconForward}
            disabled={!reachedEnd || !confirmed || !readerReady}
            onClick={() => {
              setError(null);
              setUpdated(false);
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
            <Button
              variant="ghost"
              size="lg"
              iconStart={IconBack}
              onClick={() => {
                // A drawing belongs to one reading: back on the reading step it is gone (the pad is empty too).
                setSignature(null);
                setSignatureError(null);
                setStep("read");
              }}
            >
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
