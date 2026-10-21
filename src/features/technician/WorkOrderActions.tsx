"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { useIdempotentAttempt } from "@/lib/api/attempt";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
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
export function WorkOrderActions({
  workOrderId,
  actions,
  hasAfterPhoto,
}: {
  workOrderId: string;
  actions: FieldAction[];
  hasAfterPhoto: boolean;
}) {
  const t = useTranslations("technician.workOrders.actions");
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
  return (
    <Card
      as="section"
      padding="md"
      aria-labelledby="wo-actions"
      className="flex flex-col gap-3"
      data-testid="wo-actions"
    >
      <h2 id="wo-actions" className="font-semibold">
        {t("title")}
      </h2>
      {actions.includes("accept") ? (
        <Button
          size="lg"
          block
          variant="secondary"
          iconStart={IconCheckCircle}
          loading={busy === "accept"}
          onClick={() => void run("accept", t("accepted"))}
          data-testid="wo-accept"
        >
          {t("accept")}
        </Button>
      ) : null}
      {actions.includes("check-in") ? (
        <Button
          size="lg"
          block
          iconStart={IconPlay}
          loading={busy === "check-in"}
          onClick={() => void run("check-in", t("checkedIn"))}
          data-testid="wo-check-in"
        >
          {t("checkIn")}
        </Button>
      ) : null}
      {actions.includes("resume") ? (
        <Button
          size="lg"
          block
          iconStart={IconPlay}
          loading={busy === "resume"}
          onClick={() => void run("resume", t("resumed"))}
          data-testid="wo-resume"
        >
          {t("resume")}
        </Button>
      ) : null}
      {(["wait-parts", "complete"] as const).map((action) =>
        actions.includes(action) ? (
          noteFor === action ? (
            <form
              key={action}
              className="flex flex-col gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void run(action, action === "complete" ? t("completed") : t("waiting"));
              }}
            >
              <Field label={action === "complete" ? t("completeNote") : t("waitPartsNote")}>
                <Textarea
                  rows={2}
                  maxLength={1000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  data-testid="wo-note"
                />
              </Field>
              <Button type="submit" size="lg" block loading={busy === action} data-testid={`wo-${action}-submit`}>
                {action === "complete" ? t("complete") : t("waitParts")}
              </Button>
            </form>
          ) : (
            <Button
              key={action}
              size="lg"
              block
              variant={action === "complete" ? "primary" : "secondary"}
              iconStart={action === "complete" ? IconCheckCircle : IconClock}
              onClick={() => {
                setNote("");
                setNoteFor(action);
              }}
              data-testid={`wo-${action}`}
            >
              {action === "complete" ? t("complete") : t("waitParts")}
            </Button>
          )
        ) : null,
      )}
      {actions.includes("complete") && !hasAfterPhoto ? (
        <p className="text-muted text-sm" data-testid="wo-needs-photo">
          {t("completeNeedsPhoto")}
        </p>
      ) : null}
      {error ? <ProblemCallout error={error} /> : null}
    </Card>
  );
}
