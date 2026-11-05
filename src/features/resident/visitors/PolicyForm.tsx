"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ChoiceCards, ChoiceGroup, ChoiceTiles } from "@/features/shared/Choice";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { GatePolicyAction, HousePolicy } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { Icon } from "@/ui/icons";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";

/** The waits a household picks from (the contract allows 60–900 s); an existing other value is kept as a choice. */
const MINUTES = [1, 2, 3, 5, 10, 15];
const ACTIONS: GatePolicyAction[] = ["guard_calls", "allow_and_log", "deny"];
type Delivery = "estate" | "ask" | "skip";

function deliveryOf(value: boolean | null): Delivery {
  return value === null ? "estate" : value ? "skip" : "ask";
}

export const NOTE_MAX = 300;

/**
 * The house's agreement with the gate (D-315, D-327): how long the gate waits for an answer, what the guard does when
 * nobody answers, deliveries, and a note for the guard. The household edits it; a family member reads it with who can
 * change it (the API's `canEdit`). Saved with `PUT …/gate-policy`; the API's 422 shows at its field.
 */
export function PolicyForm({ unitId, policy, canEdit }: { unitId: string; policy: HousePolicy; canEdit: boolean }) {
  const t = useTranslations("resident.visitors.policy");
  const router = useRouter();
  const current = Math.max(1, Math.round(policy.timeoutSeconds / 60));
  const [minutes, setMinutes] = useState(String(current));
  const [action, setAction] = useState<GatePolicyAction>(policy.action);
  const [delivery, setDelivery] = useState<Delivery>(deliveryOf(policy.deliverySkipApproval));
  const [note, setNote] = useState(policy.householdNote ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const choices = [...new Set([...MINUTES, current])].sort((a, b) => a - b);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      unwrap(
        await browserApi.PUT("/v1/resident/units/{unitId}/gate-policy", {
          params: { path: { unitId } },
          body: {
            timeoutSeconds: Number(minutes) * 60,
            action,
            deliverySkipApproval: delivery === "estate" ? null : delivery === "skip",
            householdNote: note.trim() ? note.trim() : null,
          },
        }),
      );
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-3" data-testid="policy-readonly">
        <dl className="rounded-card border-border bg-surface shadow-card divide-border divide-y border">
          {[
            { key: "wait", label: t("wait"), value: t("minutes", { minutes: current }) },
            { key: "action", label: t("action"), value: t(`actions.${policy.action}.title`) },
            {
              key: "delivery",
              label: t("delivery"),
              value: t(`deliveries.${deliveryOf(policy.deliverySkipApproval)}`),
            },
            ...(policy.householdNote ? [{ key: "note", label: t("note"), value: policy.householdNote }] : []),
          ].map((row) => (
            <div key={row.key} className="flex flex-col gap-0.5 px-4 py-3">
              <dt className="text-muted text-sm">{row.label}</dt>
              <dd className="font-medium break-words">{row.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-muted text-sm">{t("familyNote")}</p>
      </div>
    );
  }

  const fieldError = (path: string) => error?.errors.find((e) => e.path === path)?.message;
  return (
    <form noValidate onSubmit={save} className="flex flex-col gap-6" data-testid="policy-form">
      <ChoiceGroup legend={t("wait")} hint={t("waitHint")} error={fieldError("timeoutSeconds")} testId="policy-wait">
        {(describedBy) => (
          <ChoiceTiles
            name="policy-wait"
            variant="chip"
            columns={3}
            value={minutes}
            onChange={setMinutes}
            describedBy={describedBy}
            options={choices.map((m) => ({
              value: String(m),
              label: t("minutes", { minutes: m }),
              testId: `policy-wait-${m}`,
            }))}
          />
        )}
      </ChoiceGroup>
      <ChoiceGroup legend={t("action")} hint={t("actionHint", { minutes })} testId="policy-action">
        {(describedBy) => (
          <ChoiceCards
            name="policy-action"
            value={action}
            onChange={(value) => setAction(value as GatePolicyAction)}
            describedBy={describedBy}
            options={ACTIONS.map((a) => ({
              value: a,
              label: t(`actions.${a}.title`),
              hint: t(`actions.${a}.hint`),
              testId: `policy-action-${a}`,
            }))}
          />
        )}
      </ChoiceGroup>
      <ChoiceGroup legend={t("delivery")} hint={t("deliveryHint")} testId="policy-delivery">
        {(describedBy) => (
          <ChoiceTiles
            name="policy-delivery"
            variant="chip"
            columns={3}
            value={delivery}
            onChange={(value) => setDelivery(value as Delivery)}
            describedBy={describedBy}
            options={(["estate", "ask", "skip"] as const).map((d) => ({ value: d, label: t(`deliveries.${d}`) }))}
          />
        )}
      </ChoiceGroup>
      <Field label={t("note")} hint={t("noteHint")} error={fieldError("householdNote")}>
        <Textarea
          rows={3}
          maxLength={NOTE_MAX}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          data-testid="policy-note"
        />
      </Field>
      {error && !error.errors.length ? <ProblemCallout error={error} /> : null}
      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" block loading={busy} data-testid="policy-save">
          {t("save")}
        </Button>
        <p className="text-muted flex min-h-5 items-center gap-2 text-sm" role="status" data-testid="policy-saved">
          {saved ? (
            <>
              <Icon icon={IconCheckCircle} className="text-success" aria-hidden />
              {t("saved")}
            </>
          ) : null}
        </p>
      </div>
    </form>
  );
}
