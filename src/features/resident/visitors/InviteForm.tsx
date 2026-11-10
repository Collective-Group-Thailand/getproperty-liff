"use client";

import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

import { ChoiceGroup, ChoiceTiles } from "@/features/shared/Choice";
import type { Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { newIdempotencyKey } from "@/lib/api/key";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { InviteVisitorKind, VisitInviteCreated } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { FieldNamed } from "@/features/shared/FieldNamed";
import { Field } from "@/ui/components/Field";
import { Input, Textarea } from "@/ui/components/Input";
import { Icon, type IconGlyph } from "@/ui/icons";
import { IconInfo } from "@/ui/icons/glyphs/info";
import { IconCar } from "@/ui/icons/glyphs/car";
import { IconHammer } from "@/ui/icons/glyphs/hammer";
import { IconMore } from "@/ui/icons/glyphs/more";
import { IconResident } from "@/ui/icons/glyphs/resident";
import { IconTruck } from "@/ui/icons/glyphs/truck";

import {
  INVITE_FIELD_ORDER,
  INVITE_LIMITS,
  defaultWindow,
  validateInvite,
  type InviteDraft,
  type InviteError,
  type InviteField,
} from "./model";

/** The plate is optional: its fields (and the province list) load when the resident adds one (D-179). */
const PlateFields = dynamic(() => import("./PlateFields").then((m) => m.PlateFields));

/** What only a failed submit needs loads then (D-179). */
const InviteSummary = dynamic(() => import("./InviteNotices").then((m) => m.InviteSummary));
const ProblemCallout = dynamic(() => import("@/features/shared/ProblemNotice").then((m) => m.ProblemCallout));

/** The QR and the share step load once the invite exists (the form page stays light, D-179). */
const InviteCreatedView = dynamic(() => import("./InviteCreated").then((m) => m.InviteCreated), { ssr: false });

const KINDS: { value: InviteVisitorKind; icon: IconGlyph }[] = [
  { value: "guest", icon: IconResident },
  { value: "delivery", icon: IconTruck },
  { value: "contractor", icon: IconHammer },
  { value: "other", icon: IconMore },
];

/** The element id of a field (the error summary links to it). */
function anchorOf(field: InviteField): string {
  if (field === "plateCategory") return "invite-plate-category";
  if (field === "plateNumber") return "invite-plate-number";
  if (field === "plateProvince") return "invite-plate-province";
  return `invite-${field}`;
}

/**
 * A pass for a visitor before they come (D-327 (5)): who (kind tiles), when (from / until, Bangkok time), once or
 * several times, an optional name and plate the guard checks, a note. Checked on blur and on submit with a focusable
 * summary (J-DESIGN §2); the longest window is the estate's `inviteMaxDays` (CR #51; the API's 422 at the field
 * still answers). A contractor's pass
 * waits for the office. One Idempotency-Key per pass: a retry after a lost answer never makes a second one.
 */
export function InviteForm({
  unitId,
  unitName,
  place,
  now,
  locale,
  maxDays = null,
}: {
  unitId: string;
  unitName: string;
  place: string;
  now: number;
  locale: Locale;
  /** The estate's longest pass in days (`ResidentGateDto.inviteMaxDays`, CR #51). */
  maxDays?: number | null;
}) {
  const t = useTranslations("resident.visitors.invite");
  const [draft, setDraft] = useState<InviteDraft>(() => ({
    visitorKind: "guest",
    usage: "single",
    maxUses: String(INVITE_LIMITS.defaultUses),
    visitorName: "",
    note: "",
    plateCategory: "",
    plateNumber: "",
    plateProvince: "",
    ...defaultWindow(now),
  }));
  const [errors, setErrors] = useState<Partial<Record<InviteField, InviteError>>>({});
  const [touched, setTouched] = useState(false);
  const [summary, setSummary] = useState(false);
  /** Bumped on every refused submit; the summary takes the focus once it is committed (J deferred e2e). */
  const [summaryFocus, setSummaryFocus] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiError | null>(null);
  const [tooLong, setTooLong] = useState<number | null>(null);
  const [created, setCreated] = useState<VisitInviteCreated | null>(null);
  const [withPlate, setWithPlate] = useState(false);
  const key = useRef(newIdempotencyKey());
  const summaryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (summaryFocus) summaryRef.current?.focus();
  }, [summaryFocus]);

  const set = (patch: Partial<InviteDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (touched) setErrors(validateInvite(next, Date.now(), maxDays).errors);
    setTooLong(null);
  };
  const blur = () => {
    setTouched(true);
    setErrors(validateInvite(draft, Date.now(), maxDays).errors);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    const { errors: found, body } = validateInvite(draft, Date.now(), maxDays);
    setErrors(found);
    if (!body) {
      setSummary(true);
      setSummaryFocus((n) => n + 1);
      return;
    }
    setSummary(false);
    setBusy(true);
    setProblem(null);
    try {
      const result = unwrap(
        await browserApi.POST("/v1/resident/units/{unitId}/visit-invites", {
          params: { path: { unitId }, header: { "Idempotency-Key": key.current } },
          body,
        }),
      );
      setCreated(result);
    } catch (caught) {
      const error = toApiError(caught);
      if (error.code === "visit_invite.window_too_long") {
        const days = (error.problem.params as { days?: number } | undefined)?.days;
        setTooLong(typeof days === "number" ? days : 0);
        document.getElementById("invite-toDate")?.focus();
      } else setProblem(error);
      // A refused pass is not kept: the next try is a new intent.
      key.current = newIdempotencyKey();
    } finally {
      setBusy(false);
    }
  }

  if (created) return <InviteCreatedView invite={created} unitName={unitName} place={place} locale={locale} />;

  const message = (field: InviteField) => {
    const error = errors[field];
    if (field === "toDate" && tooLong !== null)
      return tooLong ? t("error.windowTooLongDays", { days: tooLong }) : t("error.windowTooLong");
    if (!error) return undefined;
    if (error === "window") return t("error.windowTooLongDays", { days: maxDays ?? 0 });
    return t(`error.${error}`, {
      min: INVITE_LIMITS.minUses,
      max: field === "maxUses" ? INVITE_LIMITS.maxUses : field === "note" ? INVITE_LIMITS.note : INVITE_LIMITS.name,
    });
  };
  const listed = INVITE_FIELD_ORDER.filter((f) => errors[f]);
  const plateErrors = {
    category: errors.plateCategory as never,
    number: errors.plateNumber as never,
    province: errors.plateProvince as never,
  };

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6" data-testid="invite-form">
      {summary && listed.length ? (
        <div ref={summaryRef} tabIndex={-1} className="outline-none" data-testid="invite-summary">
          <InviteSummary
            title={t("summary", { count: listed.length })}
            items={listed.map((field) => ({ href: `#${anchorOf(field)}`, label: t(`field.${field}`) }))}
          />
        </div>
      ) : null}

      <ChoiceGroup legend={t("kind")} testId="invite-kind">
        {(describedBy) => (
          <ChoiceTiles
            name="invite-kind"
            value={draft.visitorKind}
            onChange={(value) => set({ visitorKind: value as InviteVisitorKind })}
            describedBy={describedBy}
            options={KINDS.map((k) => ({
              value: k.value,
              label: t(`kinds.${k.value}`),
              icon: k.icon,
              testId: `invite-kind-${k.value}`,
            }))}
          />
        )}
      </ChoiceGroup>
      {draft.visitorKind === "contractor" ? (
        <div data-testid="invite-contractor-note">
          <p className="text-muted flex items-start gap-2 text-sm">
            <Icon icon={IconInfo} className="mt-0.5 shrink-0" aria-hidden />
            {t("contractorNote")}
          </p>
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-base font-semibold">{t("when")}</legend>
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Field label={t("field.fromDate")} error={message("fromDate")}>
            <FieldNamed>
              {(named) => (
                <Input
                  {...named}
                  id="invite-fromDate"
                  type="date"
                  value={draft.fromDate}
                  onChange={(e) => set({ fromDate: e.target.value })}
                  onBlur={blur}
                  data-testid="invite-from-date"
                />
              )}
            </FieldNamed>
          </Field>
          <Field label={t("fromTime")}>
            <Input
              type="time"
              value={draft.fromTime}
              onChange={(e) => set({ fromTime: e.target.value })}
              onBlur={blur}
              data-testid="invite-from-time"
            />
          </Field>
          <Field label={t("field.toDate")} error={message("toDate")}>
            <FieldNamed>
              {(named) => (
                <Input
                  {...named}
                  id="invite-toDate"
                  type="date"
                  value={draft.toDate}
                  onChange={(e) => set({ toDate: e.target.value })}
                  onBlur={blur}
                  data-testid="invite-to-date"
                />
              )}
            </FieldNamed>
          </Field>
          <Field label={t("toTime")}>
            <Input
              type="time"
              value={draft.toTime}
              onChange={(e) => set({ toTime: e.target.value })}
              onBlur={blur}
              data-testid="invite-to-time"
            />
          </Field>
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        <ChoiceGroup legend={t("usage")} testId="invite-usage">
          {(describedBy) => (
            <ChoiceTiles
              name="invite-usage"
              variant="chip"
              value={draft.usage}
              describedBy={describedBy}
              onChange={(value) => set({ usage: value as "single" | "multi" })}
              options={[
                { value: "single", label: t("usageSingle"), testId: "invite-usage-single" },
                { value: "multi", label: t("usageMulti"), testId: "invite-usage-multi" },
              ]}
            />
          )}
        </ChoiceGroup>
        {draft.usage === "multi" ? (
          <Field label={t("field.maxUses")} hint={t("maxUsesHint")} error={message("maxUses")}>
            <FieldNamed>
              {(named) => (
                <Input
                  {...named}
                  id="invite-maxUses"
                  inputMode="numeric"
                  className="max-w-32"
                  value={draft.maxUses}
                  onChange={(e) => set({ maxUses: e.target.value })}
                  onBlur={blur}
                  data-testid="invite-max-uses"
                />
              )}
            </FieldNamed>
          </Field>
        ) : null}
      </div>

      <Field label={t("field.visitorName")} hint={t("nameHint")} error={message("visitorName")}>
        <FieldNamed>
          {(named) => (
            <Input
              {...named}
              id="invite-visitorName"
              maxLength={INVITE_LIMITS.name + 20}
              value={draft.visitorName}
              onChange={(e) => set({ visitorName: e.target.value })}
              onBlur={blur}
              data-testid="invite-name"
            />
          )}
        </FieldNamed>
      </Field>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-base font-semibold">{t("plate")}</legend>
        <p className="text-muted -mt-1 text-sm">{t("plateHint")}</p>
        {withPlate ? (
          <PlateFields
            idPrefix="invite-plate"
            value={{ category: draft.plateCategory, number: draft.plateNumber, province: draft.plateProvince }}
            onChange={(v) => set({ plateCategory: v.category, plateNumber: v.number, plateProvince: v.province })}
            onBlur={blur}
            errors={plateErrors}
          />
        ) : (
          <Button
            variant="secondary"
            iconStart={IconCar}
            className="self-start"
            onClick={() => setWithPlate(true)}
            data-testid="invite-plate-open"
          >
            {t("plateAdd")}
          </Button>
        )}
      </fieldset>

      <Field label={t("field.note")} hint={t("noteHint")} error={message("note")}>
        <FieldNamed>
          {(named) => (
            <Textarea
              {...named}
              id="invite-note"
              rows={2}
              value={draft.note}
              onChange={(e) => set({ note: e.target.value })}
              onBlur={blur}
              data-testid="invite-note"
            />
          )}
        </FieldNamed>
      </Field>

      {problem ? <ProblemCallout error={problem} /> : null}
      <Button type="submit" size="lg" block loading={busy} data-testid="invite-submit">
        {t("submit")}
      </Button>
    </form>
  );
}
