"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { LazyCheckbox, WhenNear } from "@/features/shared/WhenNear";
import { formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { Badge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Icon } from "@/ui/icons";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconShield } from "@/ui/icons/glyphs/shield";
import { Skeleton } from "@/ui/components/Skeleton";
import { lazyWarm } from "@/ui/lib/lazy";

import { SlotPicker } from "../SlotPicker";
import { missingSteps, termsText, type SelfViewingStatus } from "./model";

/** Only for a prospect without a verified phone (D-179: the OTP input stays out of the page's first load). */
const PhoneVerify = lazyWarm(() => import("./PhoneVerify").then((m) => m.PhoneVerify));

type Slot = Schemas["ViewingSlotDto"];

/** One numbered step of the booking: done steps collapse to a tick, open ones show what to do. */
function Step({
  n,
  title,
  done,
  doneText,
  children,
  testId,
}: {
  n: number;
  title: string;
  done: boolean;
  doneText?: string;
  children?: React.ReactNode;
  testId: string;
}) {
  return (
    <Card
      as="section"
      padding="md"
      className="flex flex-col gap-3"
      aria-labelledby={`${testId}-title`}
      data-testid={testId}
      data-done={done}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={
            done
              ? "bg-success-subtle text-success-subtle-fg flex size-8 shrink-0 items-center justify-center rounded-full"
              : "bg-primary-subtle text-primary-subtle-fg flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums"
          }
        >
          {done ? <Icon icon={IconCheckCircle} /> : n}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={`${testId}-title`} className="font-semibold">
            {title}
          </h2>
          {done && doneText ? <p className="text-muted text-sm">{doneText}</p> : null}
        </div>
      </div>
      {!done && children ? <div className="flex flex-col gap-3">{children}</div> : null}
    </Card>
  );
}

/**
 * Booking a self viewing (GL2, D-295): the person proves who they are (e-KYC, D-267) and a phone, picks one of the
 * owner's self-viewing times, reads the visitor terms as the API returns them and accepts that version (never
 * pre-ticked), plus the enquiry consent on the first contact. The owner still confirms; the door code appears in the
 * enquiry only inside its window.
 */
export function SelfViewingBooking({
  slug,
  status,
  slots,
  needsConsent,
}: {
  slug: string;
  status: SelfViewingStatus;
  /** Self slots only. */
  slots: Slot[];
  needsConsent: boolean;
}) {
  const t = useTranslations("prospect.selfViewing.book");
  const rent = useTranslations("prospect.rent");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [slot, setSlot] = useState<string | null>(null);
  const [acceptedVersion, setAcceptedVersion] = useState<number | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<"terms" | "requirements" | null>(null);

  const terms = status.visitorTerms;
  const accepted = acceptedVersion === terms.version;
  const missing = missingSteps(status);
  const ready = missing.length === 0;
  const canSubmit = ready && !!slot && accepted && (!needsConsent || consent);
  const back = `/rent/${slug}/self-viewing`;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || !slot) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    let leaving = false;
    try {
      const enquiry = unwrap(
        await browserApi.POST("/v1/prospect/listings/{slug}/viewings", {
          params: { path: { slug } },
          body: {
            startsAt: slot,
            mode: "self",
            visitorTermsVersion: terms.version,
            consent: needsConsent ? consent : false,
          },
        }),
      );
      leaving = true;
      router.push(`/rent/enquiries/${enquiry.id}?done=booked`);
    } catch (caught) {
      const problem = toApiError(caught);
      if (problem.code === "viewing.terms_outdated") {
        setAcceptedVersion(null);
        setNotice("terms");
        router.refresh();
      } else if (problem.code === "viewing.requirements_missing") {
        setNotice("requirements");
        router.refresh();
      } else {
        if (problem.code === "listing.viewing_slot_taken") {
          setSlot(null);
          router.refresh();
        }
        setError(problem);
      }
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate data-testid="self-booking">
      <Step
        n={1}
        title={t("identity.title")}
        done={status.identityVerified}
        doneText={t("identity.done")}
        testId="self-step-identity"
      >
        <p className="text-muted text-sm">{t("identity.body")}</p>
        <Button asChild size="lg" block variant="secondary" iconStart={IconShield}>
          <Link href={`/rent/verification?next=${encodeURIComponent(back)}`} data-testid="self-verify-identity">
            {t("identity.action")}
          </Link>
        </Button>
      </Step>

      <Step
        n={2}
        title={t("phone.title")}
        done={status.phoneVerified}
        doneText={t("phone.done")}
        testId="self-step-phone"
      >
        <p className="text-muted text-sm">{t("phone.body")}</p>
        <Suspense fallback={<Skeleton className="h-28 w-full" />}>
          <PhoneVerify />
        </Suspense>
      </Step>

      <Step n={3} title={t("time.title")} done={false} testId="self-step-time">
        {slots.length === 0 ? (
          <Callout tone="info">{t("time.none")}</Callout>
        ) : (
          <SlotPicker slots={slots} value={slot} onChange={setSlot} testId="self-slots" />
        )}
        <p className="text-muted text-sm">
          {t("time.window", { early: status.earlyMinutes, minutes: status.codeMinutes })}
        </p>
      </Step>

      <Step n={4} title={t("terms.title")} done={false} testId="self-step-terms">
        <div className="flex items-center gap-2">
          <Badge tone="warning">{t("terms.draft")}</Badge>
          <span className="text-muted text-sm">{t("terms.version", { version: terms.version })}</span>
        </div>
        <div
          className="border-border bg-surface-subtle rounded-card max-h-60 overflow-y-auto border p-3 text-sm whitespace-pre-line"
          lang={locale === "th" ? "th" : "en"}
          tabIndex={0}
          role="region"
          aria-label={t("terms.title")}
          data-testid="self-terms"
        >
          {termsText(terms, locale)}
        </div>
        {locale !== "th" && locale !== "en" ? <p className="text-muted text-sm">{t("terms.english")}</p> : null}
        {/* D-179: the Radix checkbox loads as the terms come near the screen (page ≤ 180 KB). */}
        <WhenNear fallbackClassName="h-12 w-full" testId="self-terms-accept-slot">
          <LazyCheckbox
            label={t("terms.accept", { version: terms.version })}
            checked={accepted}
            onCheckedChange={(checked) => setAcceptedVersion(checked === true ? terms.version : null)}
            data-testid="self-terms-accept"
          />
        </WhenNear>
      </Step>

      {needsConsent ? (
        <WhenNear fallbackClassName="h-16 w-full" testId="self-consent-slot">
          <LazyCheckbox
            label={rent("consent.label")}
            description={rent("consent.hint")}
            checked={consent}
            onCheckedChange={(checked) => setConsent(checked === true)}
            data-testid="self-consent"
          />
        </WhenNear>
      ) : null}

      {notice === "terms" ? (
        <Callout tone="warning" title={t("termsChanged.title")}>
          {t("termsChanged.body")}
        </Callout>
      ) : null}
      {notice === "requirements" ? <Callout tone="warning">{t("requirementsChanged")}</Callout> : null}
      {error ? <ProblemCallout error={error} /> : null}

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" block loading={busy} disabled={!canSubmit} data-testid="self-submit">
          {slot ? t("submit", { time: formatDateTime(slot, locale) }) : t("pick")}
        </Button>
        <p className="text-muted text-center text-sm" data-testid="self-submit-hint">
          {!ready ? t("hint.steps") : t("hint.owner")}
        </p>
      </div>
    </form>
  );
}
