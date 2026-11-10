"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { formatDate, formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import type { ApiError } from "@/lib/api/problem";
import type { UnitInvitationPreview } from "@/lib/api/types";
import { Facts } from "@/features/shared/Screen";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { EmptyState } from "@/ui/components/EmptyState";
import { OTPInput } from "@/ui/components/OTPInput";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconForward } from "@/ui/icons/glyphs/forward";
import { IconHome } from "@/ui/icons/glyphs/home";
import { IconMail } from "@/ui/icons/glyphs/mail";
import { IconWarning } from "@/ui/icons/glyphs/warning";

import { canVerify, type RedeemProblem, type RedeemState } from "./redeem";

export interface UnitRedeemViewProps {
  preview: UnitInvitationPreview | null;
  state: RedeemState;
  digits: string;
  /** Seconds before another code can be sent (0 = now). */
  resendIn: number;
  locale: Locale;
  /** The problem with its request id, for `other` (an error this flow has no words of its own for). */
  error?: ApiError | null;
  onDigits: (value: string) => void;
  onSend: () => void;
  onVerify: (value: string) => void;
  onContinue: () => void;
}

function mmss(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The six boxes. They are disabled while the code is checked, which drops the focus (and the phone's keyboard); a wrong
 * code gives it back to the first box so the next try is just typing (J deferred e2e).
 */
function CodeDigits({
  retry,
  ...props
}: React.ComponentProps<typeof OTPInput> & {
  /** Changes on every wrong-code answer. */
  retry: unknown;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (retry && !props.disabled) box.current?.querySelector("input")?.focus();
  }, [retry, props.disabled]);
  return (
    <div ref={box}>
      <OTPInput {...props} />
    </div>
  );
}

/** The words for a problem the resident can act on here (the closing ones have a screen of their own). */
function CodeProblem({ problem, error }: { problem: RedeemProblem; error?: ApiError | null }) {
  const t = useTranslations("resident.link.unitInvite.problem");
  if (problem.kind === "wrongCode") {
    return (
      <Callout tone="danger" title={t("wrongCode.title")}>
        {typeof problem.attemptsRemaining === "number"
          ? t("wrongCode.attempts", { count: problem.attemptsRemaining })
          : t("wrongCode.body")}
      </Callout>
    );
  }
  if (problem.kind === "codeExpired" || problem.kind === "tooManyAttempts" || problem.kind === "rateLimited") {
    return (
      <Callout tone="warning" title={t(`${problem.kind}.title`)}>
        {t(`${problem.kind}.body`)}
      </Callout>
    );
  }
  return error ? <ProblemCallout error={error} /> : <Callout tone="danger">{t("other")}</Callout>;
}

/**
 * The co-owner's invitation, step by step (JRL, D-322): what is being added (the operator, building, unit, the
 * register's masked name and the phone the code goes to) → the six digits with the resend countdown and attempts left
 * → linked. One filled action per step; every refusal has its own words and a way on.
 */
export function UnitRedeemView({
  preview,
  state,
  digits,
  resendIn,
  locale,
  error,
  onDigits,
  onSend,
  onVerify,
  onContinue,
}: UnitRedeemViewProps) {
  const t = useTranslations("resident.link.unitInvite");

  if (state.step === "closed") {
    const kind = state.problem.kind;
    return (
      <div className="flex flex-1 flex-col gap-6 pt-2 pb-8" data-testid="unit-redeem-closed" data-problem={kind}>
        <EmptyState
          variant="card"
          icon={kind === "phoneMissing" ? IconMail : IconWarning}
          title={t(`closed.${kind}.title` as "closed.notFound.title")}
          description={t(`closed.${kind}.body` as "closed.notFound.body")}
          action={
            <Button asChild variant="secondary" iconStart={IconHome}>
              <Link href="/">{t("closed.home")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (state.step === "done") {
    const unitNo = preview?.unitNo ?? "";
    return (
      <div className="flex flex-1 flex-col gap-6 pt-2 pb-8" data-testid="unit-redeem-done">
        <EmptyState
          variant="card"
          icon={IconCheckCircle}
          title={t("done.title", { unit: unitNo })}
          description={t("done.body", { building: preview?.buildingName ?? "" })}
          action={
            <Button size="lg" iconEnd={IconForward} onClick={onContinue} data-testid="unit-redeem-continue">
              {t("done.continue", { unit: unitNo })}
            </Button>
          }
        />
      </div>
    );
  }

  const facts = preview ? (
    <Card padding="md" data-testid="unit-redeem-preview">
      <p className="text-muted text-sm">{preview.tenantName}</p>
      <p className="mt-0.5 text-xl font-semibold">{t("preview.unit", { unit: preview.unitNo })}</p>
      <p className="text-muted">{preview.buildingName}</p>
      <Facts
        className="mt-3"
        items={[
          { key: "name", label: t("preview.name"), value: preview.partyDisplayName },
          {
            key: "phone",
            label: t("preview.phone"),
            value: preview.phoneMasked ? (
              <span className="font-mono" dir="ltr">
                {preview.phoneMasked}
              </span>
            ) : (
              t("preview.noPhone")
            ),
          },
          { key: "until", label: t("preview.until"), value: formatDate(preview.expiresAt, locale) },
        ]}
      />
    </Card>
  ) : null;

  if (state.step === "preview" || (state.step === "sending" && !state.challenge)) {
    return (
      <div className="flex flex-1 flex-col gap-6 pt-2 pb-8" data-testid="unit-redeem">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
          <p className="text-muted">{t("lead")}</p>
        </div>
        {facts}
        <p className="text-muted text-sm">{t("preview.why")}</p>
        {state.step === "preview" && state.problem ? <CodeProblem problem={state.problem} error={error} /> : null}
        <Button
          size="lg"
          block
          loading={state.step === "sending"}
          disabled={resendIn > 0}
          onClick={onSend}
          data-testid="unit-redeem-send"
        >
          {resendIn > 0 ? t("code.resendIn", { time: mmss(resendIn) }) : t("preview.send")}
        </Button>
      </div>
    );
  }

  const challenge = state.challenge!;
  const problem = state.step === "code" ? state.problem : null;
  const dead = problem?.kind === "codeExpired" || problem?.kind === "tooManyAttempts";
  return (
    <form
      className="flex flex-1 flex-col gap-6 pt-2 pb-8"
      data-testid="unit-redeem-code"
      onSubmit={(event) => {
        event.preventDefault();
        if (canVerify(state, digits)) onVerify(digits);
      }}
      noValidate
    >
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-semibold">{t("code.title")}</h1>
        <p className="text-muted">
          {t.rich("code.lead", {
            phone: challenge.phoneMasked,
            mono: (chunks) => (
              <span className="font-mono" dir="ltr">
                {chunks}
              </span>
            ),
          })}
        </p>
      </div>
      <CodeDigits
        retry={problem?.kind === "wrongCode" ? problem : null}
        value={digits}
        onChange={onDigits}
        onComplete={(value) => {
          if (canVerify(state, value)) onVerify(value);
        }}
        digitLabel={(index) => t("code.digit", { index: index + 1 })}
        disabled={state.step !== "code" || dead}
        autoFocus
      />
      {problem ? <CodeProblem problem={problem} error={error} /> : null}
      <p className="text-muted text-sm">{t("code.valid", { time: formatDateTime(challenge.expiresAt, locale) })}</p>
      <Button
        type="submit"
        size="lg"
        block
        loading={state.step === "verifying"}
        disabled={!canVerify(state, digits) && state.step !== "verifying"}
        data-testid="unit-redeem-verify"
      >
        {t("code.submit")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={resendIn > 0 || state.step !== "code"}
        onClick={onSend}
        data-testid="unit-redeem-resend"
      >
        {resendIn > 0 ? t("code.resendIn", { time: mmss(resendIn) }) : t("code.resend")}
      </Button>
    </form>
  );
}
