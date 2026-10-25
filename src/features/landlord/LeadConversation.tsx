"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import type { Schemas } from "@/lib/api/types";
import { Button } from "@/ui/components/Button";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { toast } from "@/ui/components/Toast";
import { cn } from "@/ui/lib/cn";

const MAX = 2000;

/**
 * The enquiry's messages and a reply box (L5 5.3, D-251): the prospect's on the left, mine on the right; a reply goes
 * to the prospect in LINE (`POST /v1/owner/leads/{id}/messages`).
 */
export function LeadConversation({ lead }: { lead: Schemas["OwnerLeadDto"] }) {
  const t = useTranslations("landlord.home.lead");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      unwrap(
        await browserApi.POST("/v1/owner/leads/{leadId}/messages", {
          params: { path: { leadId: lead.id } },
          body: { body },
        }),
      );
      setDraft("");
      toast.success(t("sent"));
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="lead-thread" className="flex flex-col gap-3" data-testid="lead-thread">
      <h2 id="lead-thread" className="font-semibold">
        {t("thread")}
      </h2>
      <ol className="flex flex-col gap-3" role="list">
        {lead.messages.map((message) => {
          const mine = message.author === "owner";
          return (
            <li
              key={message.id}
              className={cn("flex max-w-[85%] flex-col gap-1", mine ? "items-end self-end" : "items-start self-start")}
              data-testid="lead-message"
              data-author={message.author}
            >
              <span className="text-muted text-xs">
                {mine ? t("you") : lead.prospect.name} ·{" "}
                <time dateTime={message.createdAt}>{formatDateTime(message.createdAt, locale)}</time>
              </span>
              <p
                className={cn(
                  "rounded-card px-3 py-2 break-words whitespace-pre-line",
                  mine ? "bg-primary text-primary-fg" : "bg-surface-subtle",
                )}
              >
                {message.body}
              </p>
            </li>
          );
        })}
      </ol>
      <form className="flex flex-col gap-2" onSubmit={send} data-testid="lead-reply">
        <Field label={t("replyLabel")}>
          <Textarea rows={3} maxLength={MAX} value={draft} onChange={(event) => setDraft(event.target.value)} />
        </Field>
        {error ? <ProblemCallout error={error} /> : null}
        <Button type="submit" size="lg" block loading={busy} disabled={!draft.trim()} data-testid="lead-send">
          {t("send")}
        </Button>
      </form>
    </section>
  );
}
