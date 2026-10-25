"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProblemCallout } from "@/features/shared/ProblemNotice";
import { formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { browserApi, unwrap } from "@/lib/api/browser";
import { toApiError, type ApiError } from "@/lib/api/problem";
import { Button } from "@/ui/components/Button";
import { Field } from "@/ui/components/Field";
import { Textarea } from "@/ui/components/Input";
import { cn } from "@/ui/lib/cn";

import type { Enquiry } from "./model";

const MAX = 1000;

/** The conversation with the owner (L5 5.1): theirs on the left, mine on the right, a box to write while it is open. */
export function EnquiryThread({ enquiry }: { enquiry: Enquiry }) {
  const t = useTranslations("prospect.rent.detail");
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
        await browserApi.POST("/v1/prospect/enquiries/{leadId}/messages", {
          params: { path: { leadId: enquiry.id } },
          body: { body },
        }),
      );
      setDraft("");
      router.refresh();
    } catch (caught) {
      setError(toApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="enquiry-thread" className="flex flex-col gap-3" data-testid="enquiry-thread">
      <h2 id="enquiry-thread" className="font-semibold">
        {t("thread")}
      </h2>
      {enquiry.messages.length === 0 ? <p className="text-muted text-sm">{t("empty")}</p> : null}
      <ol className="flex flex-col gap-3" role="list">
        {enquiry.messages.map((message) => {
          const mine = message.author === "prospect";
          return (
            <li
              key={message.id}
              className={cn("flex max-w-[85%] flex-col gap-1", mine ? "items-end self-end" : "items-start self-start")}
              data-testid="enquiry-message"
              data-author={message.author}
            >
              <span className="text-muted text-xs">
                {mine ? t("you") : enquiry.listing.ownerName} ·{" "}
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
      {enquiry.open ? (
        <form className="flex flex-col gap-2" onSubmit={send} data-testid="enquiry-write">
          <Field label={t("write")}>
            <Textarea rows={3} maxLength={MAX} value={draft} onChange={(event) => setDraft(event.target.value)} />
          </Field>
          {error ? <ProblemCallout error={error} /> : null}
          <Button type="submit" size="lg" block loading={busy} disabled={!draft.trim()} data-testid="enquiry-send">
            {t("send")}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
