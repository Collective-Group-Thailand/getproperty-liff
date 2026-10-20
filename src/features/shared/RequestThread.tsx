"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useState } from "react";

import { formatDateTime } from "@/i18n/format";
import { isLocale } from "@/i18n/routing";
import { bffJson } from "@/lib/api/browser";
import type { ThreadMessages } from "@/lib/api/contract-requests";
import { isApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { cn } from "@/ui/lib/cn";

import { ProblemCallout } from "./ProblemNotice";

/**
 * The request's thread — resident ↔ office ↔ technician, through the platform, never a phone number (L4 4.1 §2,
 * 4.4 §2). CONTRACT-REQUEST #23: `GET/POST /v1/resident/service-requests/{id}/messages` and the technician's
 * `/v1/technician/work-orders/{id}/messages`. Where the API does not offer the thread yet the section is not shown.
 * Re-read when the view comes back into focus (a LINE message about a reply brings the resident back here).
 */
export function RequestThread({
  path,
  canWrite,
  namespace,
}: {
  /** `/v1/resident/service-requests/{id}/messages` or `/v1/technician/work-orders/{id}/messages`. */
  path: string;
  canWrite: boolean;
  namespace: "resident.requests.thread" | "technician.workOrders.thread";
}) {
  const t = useTranslations(namespace);
  const current = useLocale();
  const locale = isLocale(current) ? current : "th";
  const id = useId();
  const [messages, setMessages] = useState<ThreadMessages["data"] | null>(null);
  const [available, setAvailable] = useState(true);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // CONTRACT-REQUEST #23 (docs/contract-requests.md).
    bffJson<ThreadMessages>(path).then(
      (thread) => !cancelled && setMessages(thread.data),
      (caught: unknown) => {
        if (!isApiError(caught)) throw caught;
        if (!cancelled && (caught.status === 404 || caught.status === 405)) setAvailable(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && setVersion((v) => v + 1);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  if (!available) return null;
  const who = (author: string, mine: boolean, name: string) =>
    mine ? t("you") : `${t(author as "office" | "technician" | "resident" | "system")}${name ? ` · ${name}` : ""}`;

  return (
    <Card as="section" padding="md" aria-labelledby={`${id}-title`} data-testid="request-thread">
      <h2 id={`${id}-title`} className="font-semibold">
        {t("title")}
      </h2>
      <p className="text-muted mt-1 text-sm">{t("lead")}</p>
      {messages === null ? null : messages.length === 0 ? (
        <p className="text-muted mt-3 text-sm">{t("empty")}</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2" aria-live="polite" data-testid="thread-messages">
          {messages.map((m) => (
            <li
              key={m.id}
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
              // CONTRACT-REQUEST #23 (docs/contract-requests.md).
              const thread = await bffJson<ThreadMessages>(path, { method: "POST", body: { body } });
              setMessages(thread.data);
              setText("");
            } catch (caught) {
              if (!isApiError(caught)) throw caught;
              setError(caught);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={t("label")}>
            <Textarea
              rows={2}
              maxLength={1000}
              placeholder={t("placeholder")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              data-testid="thread-input"
            />
          </Field>
          {error ? <ProblemCallout error={error} /> : null}
          <Button type="submit" variant="secondary" size="lg" block loading={busy} data-testid="thread-send">
            {t("send")}
          </Button>
        </form>
      ) : (
        <p className="text-muted mt-3 text-sm">{t("closed")}</p>
      )}
    </Card>
  );
}
