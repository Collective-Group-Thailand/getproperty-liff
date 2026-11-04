"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { ActionDock } from "@/features/shared/Screen";
import { useIdempotentAttempt } from "@/lib/api/attempt";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { toast } from "@/ui/components/Toast";
import { IconCheckCircle } from "@/ui/icons/glyphs/check-circle";
import { IconClock } from "@/ui/icons/glyphs/clock";
import { IconPlay } from "@/ui/icons/glyphs/play";

import type { FieldAction } from "./model";

/**
 * The next field step (L4 4.4 §2, D-072): accept, check in, waiting for parts / resume, complete — only the ones the
 * API offers (`nextActions`). Completing needs an uploaded after photo (the API answers 422
 * `work_order.photo_required` otherwise, shown with its words); notes are optional.
 */
export function WorkOrderActions({ workOrderId, actions }: { workOrderId: string; actions: FieldAction[] }) {
  const t = useTranslations("technician.workOrders.actions");
  const common = useTranslations("common");
  const router = useRouter();
  const [busy, setBusy] = useState<FieldAction | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [note, setNote] = useState("");
  const [noteFor, setNoteFor] = useState<"wait-parts" | "complete" | null>(null);
  const completion = useIdempotentAttempt<{ note: string | null }>();

  async function run(action: FieldAction, done: string) {
    setBusy(action);
    setError(null);
    const path = { params: { path: { workOrderId } } };
    const body = { note: note.trim() || null };
    try {
      if (action === "accept")
        unwrap(await browserApi.POST("/v1/technician/work-orders/{workOrderId}/actions/accept", path));
      if (action === "check-in")
        unwrap(await browserApi.POST("/v1/technician/work-orders/{workOrderId}/actions/check-in", path));
      if (action === "resume")
        unwrap(await browserApi.POST("/v1/technician/work-orders/{workOrderId}/actions/resume", path));
      if (action === "wait-parts")
        unwrap(await browserApi.POST("/v1/technician/work-orders/{workOrderId}/actions/wait-parts", { ...path, body }));
      if (action === "complete") {
        // Irreversible: one key per completion (note frozen), so a retry after a lost answer replays it (D-229).
        const { key, body: frozen } = await completion.prepare({ workOrderId, note: body.note }, () => body);
        unwrap(
          await browserApi.POST("/v1/technician/work-orders/{workOrderId}/actions/complete", {
            params: { path: { workOrderId }, header: { "Idempotency-Key": key } },
            body: frozen,
          }),
        );
        completion.succeeded();
      }
      setNote("");
      setNoteFor(null);
      void toast.success(done);
      router.refresh();
    } catch (caught) {
      const problem = toApiError(caught);
      completion.failed(problem);
      setError(problem);
    } finally {
      setBusy(null);
    }
  }

  if (actions.length === 0) return null;
  // The one step that moves the job forward now, in the job's own order (accept → start → resume → close); the
  // progress row above says where the job is. "Waiting for parts" is the only other step worth a button, and it is
  // outlined beside the lead one.
  const lead = (["accept", "check-in", "resume", "complete"] as const).find((action) => actions.includes(action));
  const pause = (lead === "complete" || !lead) && actions.includes("wait-parts");
  const icon = { accept: IconCheckCircle, "check-in": IconPlay, resume: IconPlay, complete: IconCheckCircle } as const;
  const words = {
    accept: t("accept"),
    "check-in": t("checkIn"),
    resume: t("resume"),
    complete: t("complete"),
  } as const;
  const done = { accept: t("accepted"), "check-in": t("checkedIn"), resume: t("resumed") } as const;
  return (
    <ActionDock testId="wo-actions">
      <h2 className="sr-only">{t("title")}</h2>
      {noteFor ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void run(noteFor, noteFor === "complete" ? t("completed") : t("waiting"));
          }}
        >
          <Field label={noteFor === "complete" ? t("completeNote") : t("waitPartsNote")}>
            <Textarea
              rows={2}
              maxLength={1000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="wo-note"
            />
          </Field>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={() => setNoteFor(null)}
              disabled={busy !== null}
            >
              {common("cancel")}
            </Button>
            <Button
              type="submit"
              size="lg"
              className="flex-1"
              loading={busy === noteFor}
              data-testid={`wo-${noteFor}-submit`}
            >
              {noteFor === "complete" ? t("complete") : t("waitParts")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          {pause ? (
            <Button
              variant="secondary"
              size="lg"
              iconStart={IconClock}
              onClick={() => {
                setNote("");
                setNoteFor("wait-parts");
              }}
              data-testid="wo-wait-parts"
            >
              {t("waitParts")}
            </Button>
          ) : null}
          {lead === "complete" ? (
            <Button
              size="lg"
              className="flex-1"
              iconStart={IconCheckCircle}
              onClick={() => {
                setNote("");
                setNoteFor("complete");
              }}
              data-testid="wo-complete"
            >
              {t("complete")}
            </Button>
          ) : lead ? (
            <Button
              size="lg"
              className="flex-1"
              iconStart={icon[lead]}
              loading={busy === lead}
              onClick={() => void run(lead, done[lead])}
              data-testid={`wo-${lead}`}
            >
              {words[lead]}
            </Button>
          ) : null}
        </div>
      )}
      {error ? <ProblemCallout error={error} /> : null}
    </ActionDock>
  );
}
