"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { LazyCheckbox, WhenNear } from "@/features/shared/WhenNear";
import { formatTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import type { Schemas } from "@/lib/api/types";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { Input, Textarea } from "@/ui/components/Input";
import { NativeSelect } from "@/ui/components/NativeSelect";
import { SegmentedControl } from "@/ui/components/SegmentedControl";
import { IconKey } from "@/ui/icons/glyphs/key";

import type { Slot } from "./model";
import { slotsOfMode } from "./selfViewing/model";
import { SlotPicker } from "./SlotPicker";

type Mode = "ask" | "book";
const TERMS = [6, 12, 24];
const OCCUPANTS = [1, 2, 3, 4, 5, 6];

/** Terms the prospect may share with the owner; empty fields stay out of the request. */
function terms(form: { moveIn: string; term: string; occupants: string; nationality: string }) {
  return {
    ...(form.moveIn ? { moveInDate: form.moveIn } : {}),
    ...(form.term ? { termMonths: Number(form.term) } : {}),
    ...(form.occupants ? { occupants: Number(form.occupants) } : {}),
    ...(form.nationality.trim() ? { nationality: form.nationality.trim().toUpperCase() } : {}),
  };
}

/**
 * Asking the owner or booking a viewing (L5 5.1, D-252), one screen: what to do first, then only the fields that
 * matter for it. The consent of the first contact (PDPA purpose `prospect.enquiry`) is a plain checkbox right above
 * the button — required, never pre-ticked; a follow-up in an open enquiry needs no new consent. Done → the
 * enquiry, where the owner's answer will appear.
 */
type Channel = Schemas["ListingChannel"];

export function ContactPanel({
  slug,
  slots,
  existingId,
  initialMode,
  channel = null,
  selfViewing = false,
}: {
  slug: string;
  slots: Slot[];
  /** GL2 (D-295): the listing offers self-viewing times now — offered as their own page. */
  selfViewing?: boolean;
  /** My open enquiry about this listing, when there is one. */
  existingId: string | null;
  initialMode: Mode;
  /** The share-kit channel the prospect came from (`?ch=` of the short link, D-268), recorded on a new enquiry. */
  channel?: Channel | null;
}) {
  const t = useTranslations("prospect.rent");
  const sv = useTranslations("prospect.selfViewing.offer");
  const router = useRouter();
  // Self slots are booked on their own page (identity, phone, visitor terms); this picker shows accompanied ones.
  const accompanied = slotsOfMode(slots, "accompanied");
  const selfSlots = selfViewing && slotsOfMode(slots, "self").length > 0;
  const locale = useLocale() as Locale;
  const [mode, setMode] = useState<Mode>(initialMode);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [form, setForm] = useState({ moveIn: "", term: "", occupants: "", nationality: "" });
  const [slot, setSlot] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentMissing, setConsentMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const needsConsent = existingId === null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (needsConsent && !consent) {
      setConsentMissing(true);
      return;
    }
    if (mode === "ask" && !message.trim()) return;
    if (mode === "book" && !slot) return;
    setBusy(true);
    setError(null);
    let leaving = false;
    try {
      const params = { path: { slug } };
      const enquiry =
        mode === "ask"
          ? unwrap(
              await browserApi.POST("/v1/prospect/listings/{slug}/enquiries", {
                params,
                body: { message: message.trim(), consent, channel, ...terms(form) },
              }),
            )
          : unwrap(
              await browserApi.POST("/v1/prospect/listings/{slug}/viewings", {
                params,
                body: { startsAt: slot!, consent, note: note.trim() || null, channel, ...terms(form) },
              }),
            );
      leaving = true;
      router.push(`/rent/enquiries/${enquiry.id}?done=${mode === "ask" ? "sent" : "booked"}`);
    } catch (caught) {
      const problem = toApiError(caught);
      setError(problem);
      if (problem.code === "listing.viewing_slot_taken") {
        setSlot(null);
        router.refresh();
      }
    } finally {
      if (!leaving) setBusy(false);
    }
  }

  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const picked = accompanied.find((s) => s.startsAt === slot);

  return (
    <form className="flex flex-col gap-5" onSubmit={submit} noValidate data-testid="prospect-contact">
      <SegmentedControl
        label={t("choose.label")}
        value={mode}
        onValueChange={(next) => {
          setMode(next as Mode);
          setError(null);
        }}
        options={[
          { value: "ask", label: t("choose.ask") },
          { value: "book", label: t("choose.book") },
        ]}
        size="lg"
        fullWidth
      />

      {existingId ? (
        <Callout tone="info" title={t("existing.title")}>
          <span className="flex flex-col gap-2">
            <span>{t("existing.body")}</span>
            <a href={`/rent/enquiries/${existingId}`} className="text-primary font-medium underline">
              {t("existing.open")}
            </a>
          </span>
        </Callout>
      ) : null}

      {mode === "ask" ? (
        <Field label={t("ask.message")} required>
          <Textarea
            rows={4}
            maxLength={2000}
            value={message}
            placeholder={t("ask.messagePlaceholder")}
            onChange={(event) => setMessage(event.target.value)}
            data-testid="prospect-message"
          />
        </Field>
      ) : accompanied.length === 0 ? (
        <Callout tone="info">{t("book.noSlots")}</Callout>
      ) : (
        <>
          <SlotPicker slots={accompanied} value={slot} onChange={setSlot} />
          <Field label={t("book.note")}>
            <Textarea
              rows={2}
              maxLength={500}
              value={note}
              placeholder={t("book.notePlaceholder")}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
        </>
      )}

      {mode === "book" && selfSlots ? (
        <Card as="section" padding="md" className="flex flex-col gap-2" data-testid="self-offer">
          <h2 className="flex items-center gap-2 font-semibold">{sv("title")}</h2>
          <p className="text-muted text-sm">{sv("body")}</p>
          <Button asChild variant="secondary" size="lg" block iconStart={IconKey}>
            <a href={`/rent/${slug}/self-viewing`} data-testid="self-offer-open">
              {sv("action")}
            </a>
          </Button>
        </Card>
      ) : null}

      {needsConsent ? (
        <details className="border-border rounded-card group border p-3" data-testid="prospect-details">
          <summary className="flex min-h-12 cursor-pointer items-center font-medium">{t("ask.more")}</summary>
          <div className="grid grid-cols-2 gap-3 pt-2">
            <Field label={t("ask.moveIn")} className="col-span-2">
              <Input type="date" value={form.moveIn} onChange={(event) => set("moveIn")(event.target.value)} />
            </Field>
            <Field label={t("ask.term")}>
              <NativeSelect
                value={form.term}
                onChange={(event) => set("term")(event.target.value)}
                options={[
                  { value: "", label: t("ask.termAny") },
                  ...TERMS.map((m) => ({ value: String(m), label: t("ask.termValue", { count: m }) })),
                ]}
              />
            </Field>
            <Field label={t("ask.occupants")}>
              <NativeSelect
                value={form.occupants}
                onChange={(event) => set("occupants")(event.target.value)}
                options={[
                  { value: "", label: t("ask.optional") },
                  ...OCCUPANTS.map((n) => ({ value: String(n), label: t("ask.occupantsValue", { count: n }) })),
                ]}
              />
            </Field>
            <Field label={t("ask.nationality")} hint={t("ask.nationalityHint")} className="col-span-2">
              <Input
                value={form.nationality}
                maxLength={2}
                autoCapitalize="characters"
                onChange={(event) => set("nationality")(event.target.value)}
              />
            </Field>
          </div>
        </details>
      ) : null}

      {needsConsent ? (
        <div className="flex flex-col gap-1">
          {/* D-179: the Radix checkbox loads as the consent comes near the screen (listing page ≤ 180 KB, GL2). */}
          <WhenNear fallbackClassName="h-16 w-full" testId="prospect-consent-slot">
            <LazyCheckbox
              label={t("consent.label")}
              description={t("consent.hint")}
              checked={consent}
              onCheckedChange={(checked) => {
                setConsent(checked === true);
                setConsentMissing(false);
              }}
              required
              data-testid="prospect-consent"
            />
          </WhenNear>
          {consentMissing ? <Callout tone="danger">{t("consent.required")}</Callout> : null}
        </div>
      ) : null}

      {error ? <ProblemCallout error={error} /> : null}

      <div className="flex flex-col gap-2">
        <Button
          type="submit"
          size="lg"
          block
          loading={busy}
          disabled={mode === "ask" ? !message.trim() : !slot}
          data-testid="prospect-submit"
        >
          {mode === "ask"
            ? t("ask.send")
            : picked
              ? t("book.submit", { time: formatTime(picked.startsAt, locale) })
              : t("book.pick")}
        </Button>
        {mode === "book" ? <p className="text-muted text-center text-sm">{t("book.hint")}</p> : null}
      </div>
    </form>
  );
}
