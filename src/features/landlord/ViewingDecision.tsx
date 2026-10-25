"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { toast } from "@/ui/components/Toast";
import { IconCheck } from "@/ui/icons/glyphs/check";
import { IconClose } from "@/ui/icons/glyphs/close";

/**
 * Confirm or decline a requested viewing in one tap (L5 5.3): the prospect hears it in LINE. Declining asks for the
 * reason the prospect will read (`ViewingDeclineDto.reason`).
 */
export function ViewingDecision({ viewingId }: { viewingId: string }) {
  const t = useTranslations("landlord.home.viewings");
  const common = useTranslations("common");
  const router = useRouter();
  const [busy, setBusy] = useState<"confirm" | "decline" | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<ApiError | null>(null);

  async function run(kind: "confirm" | "decline") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "confirm") {
        unwrap(
          await browserApi.POST("/v1/owner/listing-viewings/{viewingId}/actions/confirm", {
            params: { path: { viewingId } },
          }),
        );
        toast.success(t("confirmed"));
      } else {
        unwrap(
          await browserApi.POST("/v1/owner/listing-viewings/{viewingId}/actions/decline", {
            params: { path: { viewingId } },
            body: { reason: reason.trim() },
          }),
        );
        toast.success(t("declined"));
      }
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {declining ? (
        <div className="flex flex-col gap-2" data-testid="viewing-decline-form">
          <p className="text-sm">{t("declineBody")}</p>
          <Field label={t("declineReason")}>
            <Textarea rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setDeclining(false)} disabled={busy !== null}>
              {common("cancel")}
            </Button>
            <Button
              variant="destructive"
              loading={busy === "decline"}
              disabled={!reason.trim()}
              onClick={() => void run("decline")}
              data-testid="viewing-decline-send"
            >
              {t("decline")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            iconStart={IconCheck}
            loading={busy === "confirm"}
            onClick={() => void run("confirm")}
            data-testid="viewing-confirm"
          >
            {t("confirm")}
          </Button>
          <Button
            variant="secondary"
            iconStart={IconClose}
            onClick={() => setDeclining(true)}
            data-testid="viewing-decline"
          >
            {t("decline")}
          </Button>
        </div>
      )}
      {error ? <ProblemCallout error={error} /> : null}
    </div>
  );
}
