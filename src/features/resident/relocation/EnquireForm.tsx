"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { useIdempotentAttempt } from "@/lib/api/attempt";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Checkbox } from "@/ui/components/Checkbox";
import { Field } from "@/ui/components/Field";
import { Input, Textarea } from "@/ui/components/Input";
import { IconChat } from "@/ui/icons/glyphs/chat";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconForward } from "@/ui/icons/glyphs/forward";

import { CONSENT_GONE, enquiryBody, type EnquiryDraft } from "./model";

const MESSAGE_MAX = 2000;

/**
 * Asking a listing's owner from my relocation offer (D-299) — **one step** that may carry my rent record: the
 * message (and move-in date) goes to the owner as an enquiry of my LINE login (B7.3, the owner's `prospect.enquiry`
 * consent, required, never pre-ticked); the rent record (D-256) goes with it **only when I tick it now** — the only way
 * it travels from here. The answer says whether it went (no confirmed month yet = not sent). One `Idempotency-Key`
 * per enquiry, its body frozen for retries.
 */
export function EnquireForm({
  offerId,
  slug,
  title,
  record,
}: {
  offerId: string;
  slug: string;
  title: string;
  /** My rent record's summary, when I have confirmed months to send; null hides the box. */
  record: Pick<Schemas["RentRecordDto"], "onTime" | "late" | "outstanding"> | null;
}) {
  const t = useTranslations("resident.relocation.enquire");
  const router = useRouter();
  const [draft, setDraft] = useState<EnquiryDraft>({
    message: "",
    moveInDate: "",
    shareRentRecord: false,
    consent: false,
  });
  const [consentMissing, setConsentMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<Schemas["RelocationEnquiryDto"] | null>(null);
  const attempt = useIdempotentAttempt<Schemas["RelocationEnquireDto"]>();
  const set = <K extends keyof EnquiryDraft>(key: K, value: EnquiryDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  if (done) {
    return (
      <div className="flex flex-col gap-4" data-testid="relocation-enquire-done" data-shared={done.rentRecordShared}>
        <Callout tone="success" icon={IconCheckCircle} title={t("done.title")}>
          {done.created ? t("done.created") : t("done.followUp")}
        </Callout>
        <p className="text-sm" data-testid="relocation-enquire-record">
          {done.rentRecordShared
            ? t("done.recordShared")
            : draft.shareRentRecord
              ? t("done.recordNotYet")
              : t("done.recordKept")}
        </p>
        <Button asChild size="lg" block iconStart={IconChat} iconEnd={IconForward}>
          <a href={`/rent/enquiries/${done.leadId}`} data-testid="relocation-enquire-open">
            {t("done.open")}
          </a>
        </Button>
      </div>
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.message.trim()) return;
    if (!draft.consent) {
      setConsentMissing(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = enquiryBody(slug, draft);
      const prepared = await attempt.prepare({ offerId, ...body }, () => body);
      const result = unwrap(
        await browserApi.POST("/v1/resident/relocation-offers/{offerId}/actions/enquire", {
          params: { path: { offerId }, header: { "Idempotency-Key": prepared.key } },
          body: prepared.body,
        }),
      );
      attempt.succeeded();
      setDone(result);
      router.refresh();
    } catch (caught) {
      const problem = toApiError(caught);
      attempt.failed(problem);
      setError(problem);
      if (CONSENT_GONE.has(problem.code) || problem.code === "relocation.invalid_state") router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate data-testid="relocation-enquire-form">
      <p className="text-muted text-sm">{t("to", { title })}</p>
      <Field label={t("message")} required>
        <Textarea
          rows={4}
          maxLength={MESSAGE_MAX}
          value={draft.message}
          placeholder={t("messagePlaceholder")}
          onChange={(event) => set("message", event.target.value)}
          data-testid="relocation-enquire-message"
        />
      </Field>
      <Field label={t("moveIn")} hint={t("moveInHint")}>
        <Input
          type="date"
          inputSize="lg"
          value={draft.moveInDate}
          onChange={(event) => set("moveInDate", event.target.value)}
          data-testid="relocation-enquire-move-in"
        />
      </Field>

      {record ? (
        <div
          className="border-border rounded-card flex flex-col gap-2 border p-3"
          data-testid="relocation-enquire-share"
        >
          <Checkbox
            label={t("share.label")}
            description={t("share.hint", { onTime: record.onTime, late: record.late, outstanding: record.outstanding })}
            checked={draft.shareRentRecord}
            onCheckedChange={(checked) => set("shareRentRecord", checked === true)}
            data-testid="relocation-enquire-share-box"
          />
        </div>
      ) : (
        <p className="text-muted text-sm" data-testid="relocation-enquire-no-record">
          {t("share.none")}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <Checkbox
          label={t("consent.label")}
          description={t("consent.hint")}
          checked={draft.consent}
          onCheckedChange={(checked) => {
            set("consent", checked === true);
            setConsentMissing(false);
          }}
          required
          data-testid="relocation-enquire-consent"
        />
        {consentMissing ? (
          <Callout tone="danger">
            <span role="alert">{t("consent.required")}</span>
          </Callout>
        ) : null}
      </div>

      {error ? <ProblemCallout error={error} /> : null}
      <Button
        type="submit"
        size="lg"
        block
        loading={busy}
        disabled={!draft.message.trim()}
        data-testid="relocation-enquire-submit"
      >
        {draft.shareRentRecord ? t("submitWithRecord") : t("submit")}
      </Button>
    </form>
  );
}
