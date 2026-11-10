"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { ChoiceGroup, ChoiceTiles } from "@/features/shared/Choice";
import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { useIdempotentAttempt } from "@/lib/api/attempt";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { isRefusal } from "@/lib/api/refusal";
import type { IncidentKind } from "@/lib/api/types";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
// eslint-disable-next-line no-restricted-imports -- this module is itself loaded on first open (SosLauncher, D-179)
import { Sheet } from "@/ui/components/Sheet";
import type { IconGlyph } from "@/ui/icons";
import { IconFlame } from "@/ui/icons/glyphs/flame";
import { IconHeartPulse } from "@/ui/icons/glyphs/heart-pulse";
import { IconShieldAlert } from "@/ui/icons/glyphs/shield-alert";
import { IconSiren } from "@/ui/icons/glyphs/siren";

import { HoldToConfirm } from "./HoldToConfirm";

export interface SosSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unitId: string;
  /** "บ้าน 88/12" — where the guard goes. */
  unitName: string;
}

const KINDS: { value: IncidentKind; icon: IconGlyph }[] = [
  { value: "medical", icon: IconHeartPulse },
  { value: "fire", icon: IconFlame },
  { value: "intrusion", icon: IconShieldAlert },
  { value: "other", icon: IconSiren },
];

export const SOS_NOTE_MAX = 500;

type SosBody = { unitId: string; kind: IncidentKind; note?: string };

/**
 * "ฉุกเฉิน" (D-317, D-328): what is happening (four large tiles), an optional line for the guard, then hold to send —
 * every gate of the estate and the office are alerted at once. One Idempotency-Key per emergency {unit, kind, note}
 * with its body frozen (review L2): a retry after a lost answer never raises a second one; another kind or note is a
 * new key. `idempotency.key_reused` is sent again at once with a new key — an SOS already open for the unit comes back
 * (`existing`) and the status page says so. Then the status page: sent → taken by the guard, with cancel while the API allows it.
 */
export default function SosSheet({ open, onOpenChange, unitId, unitName }: SosSheetProps) {
  const t = useTranslations("resident.visitors.sos");
  const router = useRouter();
  const [kind, setKind] = useState<IncidentKind | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const attempt = useIdempotentAttempt<SosBody>();

  const send = useCallback(async () => {
    if (!kind) return;
    setBusy(true);
    setError(null);
    const body: SosBody = { unitId, kind, ...(note.trim() ? { note: note.trim() } : {}) };
    const post = async () => {
      const { key, body: frozen } = await attempt.prepare(body, () => body);
      return unwrap(
        await browserApi.POST("/v1/resident/sos", { params: { header: { "Idempotency-Key": key } }, body: frozen }),
      );
    };
    try {
      let created;
      try {
        created = await post();
      } catch (caught) {
        const first = toApiError(caught);
        if (first.code !== "idempotency.key_reused") throw first;
        attempt.failed(first); // a new key for the same emergency: the API answers with the one already open
        created = await post();
      }
      attempt.succeeded();
      router.push(`/sos/${created.id}${created.existing ? "?existing=1" : ""}`);
    } catch (caught) {
      const problem = toApiError(caught);
      if (isRefusal(problem)) attempt.succeeded();
      else attempt.failed(problem);
      setError(problem);
      setBusy(false);
    }
  }, [kind, note, unitId, router, attempt]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}
      title={t("title")}
      description={t("description", { unit: unitName })}
      closeLabel={t("close")}
    >
      <div className="flex flex-col gap-5 pb-2" data-testid="sos-sheet">
        <ChoiceGroup legend={t("kindLegend")} testId="sos-kinds">
          {(describedBy) => (
            <ChoiceTiles
              name="sos-kind"
              value={kind}
              onChange={(value) => setKind(value as IncidentKind)}
              describedBy={describedBy}
              options={KINDS.map((k) => ({
                value: k.value,
                label: t(`kind.${k.value}`),
                icon: k.icon,
                testId: `sos-kind-${k.value}`,
              }))}
            />
          )}
        </ChoiceGroup>
        <Field label={t("note")} hint={t("noteHint")}>
          <Textarea
            rows={2}
            maxLength={SOS_NOTE_MAX}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            data-testid="sos-note"
          />
        </Field>
        {error ? <ProblemCallout error={error} /> : null}
        <HoldToConfirm
          label={kind ? t("hold") : t("chooseFirst")}
          holdingLabel={t("holding")}
          tapHint={t("tapHint")}
          accessibleLabel={t("accessible")}
          disabled={!kind}
          busy={busy}
          onConfirm={() => void send()}
          testId="sos-hold"
          confirm={{
            title: t("confirm.title", { kind: kind ? t(`kind.${kind}`) : "" }),
            body: t("confirm.body", { unit: unitName }),
            confirmLabel: t("confirm.send"),
            cancelLabel: t("confirm.cancel"),
          }}
        />
      </div>
    </Sheet>
  );
}
