"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import { formatDateTime } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { newIdempotencyKey } from "@/lib/api/idempotency";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { ServiceMessage } from "@/lib/api/types";
import { MESSAGE_EVENT, onRealtime } from "@/lib/realtime/events";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { cn } from "@/ui/lib/cn";

import { ProblemCallout } from "./ProblemNotice";

/** The API's limit on one message (`ServiceMessageCreateDto.body`, D-218). */
export const MAX_MESSAGE_LENGTH = 2000;

/** Whose thread: the resident's request, or the technician's work order (the same thread when it has a request). */
export type ThreadOf = { kind: "resident"; serviceRequestId: string } | { kind: "technician"; workOrderId: string };

async function readThread(of: ThreadOf): Promise<ServiceMessage[]> {
  const result =
    of.kind === "resident"
      ? await browserApi.GET("/v1/resident/service-requests/{serviceRequestId}/messages", {
          params: { path: { serviceRequestId: of.serviceRequestId } },
        })
      : await browserApi.GET("/v1/technician/work-orders/{workOrderId}/messages", {
          params: { path: { workOrderId: of.workOrderId } },
        });
  return unwrap(result).data;
}

async function postMessage(of: ThreadOf, body: string, key: string): Promise<ServiceMessage> {
  const header = { "Idempotency-Key": key };
  const result =
    of.kind === "resident"
      ? await browserApi.POST("/v1/resident/service-requests/{serviceRequestId}/messages", {
          params: { path: { serviceRequestId: of.serviceRequestId }, header },
          body: { body },
        })
      : await browserApi.POST("/v1/technician/work-orders/{workOrderId}/messages", {
          params: { path: { workOrderId: of.workOrderId }, header },
          body: { body },
        });
  return unwrap(result);
}

/**
 * The request's thread — resident ↔ office ↔ technician, through the platform, never a phone number (L4 4.1 §2,
 * 4.4 §2; D-218): `GET/POST /v1/resident/service-requests/{id}/messages` or the technician's
 * `/v1/technician/work-orders/{id}/messages` (a work order without a request has its own thread with the office).
 * Re-read on the realtime `service_request.message` event and when the view comes back into focus (a LINE message
 * about a reply brings the reader back here). One `Idempotency-Key` per message, kept for a retry of the same text.
 */
export function RequestThread({
  of,
  canWrite,
  namespace,
  withOffice = false,
}: {
  of: ThreadOf;
  canWrite: boolean;
  namespace: "resident.requests.thread" | "technician.workOrders.thread";
  /** A technician's work order without a request: the thread is with the office only. */
  withOffice?: boolean;
}) {
  const t = useTranslations(namespace);
  const current = useLocale();
  const locale = isLocale(current) ? current : "th";
  const id = useId();
  const [messages, setMessages] = useState<ServiceMessage[] | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const [version, setVersion] = useState(0);
  const target = of.kind === "resident" ? of.serviceRequestId : of.workOrderId;

  useEffect(() => {
    let cancelled = false;
    readThread(of).then(
      (data) => {
        if (cancelled) return;
        setMessages(data);
        setLoadError(null);
      },
      (caught: unknown) => {
        if (!cancelled) setLoadError(toApiError(caught));
      },
    );
    return () => {
      cancelled = true;
    };
    // `of` is identified by its kind and id; a new object for the same thread must not re-read it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [of.kind, target, version]);

  useEffect(() => {
    const reread = () => setVersion((v) => v + 1);
    const onVisible = () => document.visibilityState === "visible" && reread();
    document.addEventListener("visibilitychange", onVisible);
    const off = onRealtime(MESSAGE_EVENT, reread);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      off();
    };
  }, []);

  const who = (author: ServiceMessage["author"], mine: boolean, name: string) =>
    mine ? t("you") : `${t(author)}${name ? ` · ${name}` : ""}`;

  return (
    <Card as="section" padding="md" aria-labelledby={`${id}-title`} data-testid="request-thread">
      <h2 id={`${id}-title`} className="font-semibold">
        {withOffice && namespace === "technician.workOrders.thread" ? t("titleOffice") : t("title")}
      </h2>
      <p className="text-muted mt-1 text-sm">
        {withOffice && namespace === "technician.workOrders.thread" ? t("leadOffice") : t("lead")}
      </p>
      {loadError && messages === null ? (
        <div className="mt-3">
          <ProblemCallout error={loadError} />
        </div>
      ) : messages === null ? null : messages.length === 0 ? (
        <p className="text-muted mt-3 text-sm">{t("empty")}</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2" aria-live="polite" data-testid="thread-messages">
          {messages.map((m) => (
            <li
              key={m.id}
              data-author={m.author}
              className={cn(
                "rounded-card max-w-[85%] px-3 py-2",
                m.mine ? "bg-primary-subtle text-primary-subtle-fg self-end" : "bg-surface-subtle self-start",
              )}
            >
              <p className="text-xs font-medium">{who(m.author, m.mine, m.mine ? "" : m.authorName)}</p>
              <p className="break-words whitespace-pre-line">{m.body}</p>
              <p className="text-muted text-xs tabular-nums">{formatDateTime(m.createdAt, locale)}</p>
            </li>
          ))}
        </ol>
      )}
      {canWrite ? (
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            const body = text.trim();
            if (!body) return;
            setBusy(true);
            setError(null);
            try {
              const sent = await postMessage(of, body, key);
              setMessages((list) => (list?.some((m) => m.id === sent.id) ? list : [...(list ?? []), sent]));
              setText("");
              setKey(newIdempotencyKey());
            } catch (caught) {
              setError(toApiError(caught));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={t("label")}>
            <Textarea
              rows={2}
              maxLength={MAX_MESSAGE_LENGTH}
              placeholder={t("placeholder")}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setKey(newIdempotencyKey());
              }}
              data-testid="thread-input"
            />
          </Field>
          {error ? <ProblemCallout error={error} /> : null}
          <Button type="submit" variant="secondary" size="lg" block loading={busy} data-testid="thread-send">
            {t("send")}
          </Button>
        </form>
      ) : (
        <p className="text-muted mt-3 text-sm" data-testid="thread-closed">
          {t("closed")}
        </p>
      )}
    </Card>
  );
}
