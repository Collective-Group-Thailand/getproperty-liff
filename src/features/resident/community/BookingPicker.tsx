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
import { Field } from "@/ui/components/Field";
import { Input } from "@/ui/components/Input";
import { NativeSelect } from "@/ui/components/NativeSelect";
import { cn } from "@/ui/lib/cn";

import { durationsFrom, type Slot, type SlotState } from "./slots";

/**
 * The slots of one day as large buttons (free ones selectable; booked, mine and passed ones say so in words, not
 * only colour), a duration when the policy allows more than one slot, a note, then `POST /v1/resident/facility-bookings`.
 * The API decides: a slot someone just took is 409 `facility.slot_taken`, the weekly quota 422
 * `facility.quota_exceeded` — both shown with the API's words, and the day is re-read.
 */
export function BookingPicker({
  facilityId,
  unitId,
  slots,
  states,
  policy,
}: {
  facilityId: string;
  unitId: string;
  slots: Slot[];
  states: SlotState[];
  policy: Schemas["BookingPolicyDto"];
}) {
  const t = useTranslations("resident.community.facilities");
  const router = useRouter();
  const [index, setIndex] = useState<number | null>(null);
  const [minutes, setMinutes] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const attempt = useIdempotentAttempt<Schemas["BookingCreateDto"]>();
  const [error, setError] = useState<ApiError | null>(null);
  const [done, setDone] = useState<Schemas["BookingDto"] | null>(null);

  if (slots.length === 0) return <p className="text-muted">{t("noSlots")}</p>;
  const durations = index === null ? [] : durationsFrom(index, slots, states, policy);
  const chosen = durations.find((d) => d.minutes === minutes) ?? durations[0];

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-2 gap-2" role="list" data-testid="slots">
        {slots.map((slot, i) => {
          const state = states[i]!;
          const label = t(
            state === "free" ? "slotFree" : state === "mine" ? "slotMine" : state === "busy" ? "slotBusy" : "slotPast",
            { from: slot.from, to: slot.to },
          );
          return (
            <li key={slot.startsAt}>
              <button
                type="button"
                disabled={state !== "free" || busy}
                aria-pressed={index === i}
                aria-label={label}
                onClick={() => {
                  setIndex(i);
                  setMinutes(0);
                  setDone(null);
                  setError(null);
                }}
                className={cn(
                  "rounded-control flex min-h-12 w-full flex-col items-center justify-center border px-2 py-1 text-sm",
                  state === "free" && "border-border bg-surface",
                  state === "free" &&
                    index === i &&
                    "border-primary bg-primary-subtle text-primary-subtle-fg font-semibold",
                  state === "mine" && "border-success-subtle bg-success-subtle text-success-subtle-fg",
                  (state === "busy" || state === "past") && "border-border bg-surface-subtle text-muted",
                )}
                data-testid="slot"
                data-state={state}
              >
                <span className="tabular-nums">
                  {slot.from}–{slot.to}
                </span>
                <span aria-hidden="true" className="text-xs">
                  {state === "free" ? "" : state === "mine" ? t("slotMineShort") : state === "busy" ? "●" : "—"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {done ? (
        <div role="status" data-testid="booking-done">
          <Callout tone="success">{done.status === "requested" ? t("requested") : t("booked")}</Callout>
        </div>
      ) : null}
      {index !== null && chosen ? (
        <form
          className="flex flex-col gap-3"
          data-testid="booking-form"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            try {
              const request = {
                facilityId,
                unitId,
                startsAt: slots[index]!.startsAt,
                endsAt: chosen.endsAt,
                note: note.trim() || null,
              };
              // One key per booking: a retry after a lost answer gets the booking, not 409 for my own slot (D-229).
              const { key, body } = await attempt.prepare(request, () => request);
              const booking = unwrap(
                await browserApi.POST("/v1/resident/facility-bookings", {
                  params: { header: { "Idempotency-Key": key } },
                  body,
                }),
              );
              attempt.succeeded();
              setDone(booking);
              setIndex(null);
              setNote("");
              router.refresh();
            } catch (caught) {
              const problem = toApiError(caught);
              attempt.failed(problem);
              setError(problem);
              router.refresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          <p className="font-medium" aria-live="polite">
            {t("selected", { from: slots[index]!.from, to: chosen.to })}
          </p>
          {durations.length > 1 ? (
            <Field label={t("duration")}>
              <NativeSelect
                value={String(chosen.minutes)}
                onChange={(e) => setMinutes(Number(e.target.value))}
                options={durations.map((d) => ({ value: String(d.minutes), label: `${slots[index]!.from}–${d.to}` }))}
                data-testid="booking-duration"
              />
            </Field>
          ) : null}
          <Field label={t("note")}>
            <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          </Field>
          {error ? <ProblemCallout error={error} /> : null}
          <Button type="submit" size="lg" block loading={busy} data-testid="booking-submit">
            {t("confirm", { from: slots[index]!.from, to: chosen.to })}
          </Button>
        </form>
      ) : error ? (
        <ProblemCallout error={error} />
      ) : null}
    </div>
  );
}
