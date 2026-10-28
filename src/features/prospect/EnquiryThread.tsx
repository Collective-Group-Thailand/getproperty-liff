"use client";

import { useLocale, useTranslations } from "next-intl";

import { WhenNear } from "@/features/shared/WhenNear";
import { formatDateTime } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { cn } from "@/ui/lib/cn";
import { lazyWarm } from "@/ui/lib/lazy";

import type { Enquiry } from "./model";

/** The write box sits at the end of the page: loaded as it comes near the screen (D-179, GL2). */
const EnquiryWrite = lazyWarm(() => import("./EnquiryWrite").then((m) => m.EnquiryWrite));

/** The conversation with the owner (L5 5.1): theirs on the left, mine on the right, a box to write while it is open. */
export function EnquiryThread({ enquiry }: { enquiry: Enquiry }) {
  const t = useTranslations("prospect.rent.detail");
  const locale = useLocale() as Locale;
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
        <WhenNear fallbackClassName="h-40 w-full" testId="enquiry-write-slot">
          <EnquiryWrite leadId={enquiry.id} />
        </WhenNear>
      ) : null}
    </section>
  );
}
