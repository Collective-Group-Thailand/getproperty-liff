import { getTranslations } from "next-intl/server";

import { REVIEW_STATUS } from "@/domain/status/growth";
import { formatDate, formatPeriodKey } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { StatusBadge } from "@/ui/components/Badge";
import { Callout } from "@/ui/components/Callout";
import { Card } from "@/ui/components/Card";

import { canWithdraw, type MyReview } from "./model";
import { Stars } from "./Stars";
import { WithdrawReview } from "./WithdrawReview";

/**
 * My review as the API keeps it (D-301): its moderation state (pre-moderated while O-035 is open — *waiting for the
 * getproperty team*), the reason of a rejection or of hiding, the rating, the text (erased once withdrawn), the months
 * I lived there (never exact dates) and the owner's public reply. Withdrawal while it is not withdrawn yet.
 */
export async function MyReviewCard({ review, leaseId, locale }: { review: MyReview; leaseId: string; locale: Locale }) {
  const [t, status] = await Promise.all([getTranslations("resident.reviews.mine"), getTranslations()]);
  const meta = REVIEW_STATUS[review.state];
  const tenure = review.tenure.to
    ? t("tenure", { from: formatPeriodKey(review.tenure.from, locale), to: formatPeriodKey(review.tenure.to, locale) })
    : t("tenureNow", { from: formatPeriodKey(review.tenure.from, locale) });
  return (
    <div className="flex flex-col gap-4" data-testid="review-mine" data-state={review.state}>
      {review.state === "pending_moderation" ? (
        <Callout tone="info" title={t("pending.title")}>
          {t("pending.body")}
        </Callout>
      ) : review.state === "published" ? (
        <Callout tone="success" title={t("published.title")}>
          {t("published.body")}
        </Callout>
      ) : review.state === "rejected" || review.state === "hidden" ? (
        <Callout tone="warning" title={t(`${review.state}.title`)}>
          <span data-testid="review-moderation-reason">
            {review.moderationReason
              ? t(`${review.state}.reason`, { reason: review.moderationReason })
              : t(`${review.state}.body`)}
          </span>
        </Callout>
      ) : (
        <Callout tone="neutral" title={t("withdrawn.title")}>
          {t("withdrawn.body")}
        </Callout>
      )}

      <Card as="section" padding="md" aria-labelledby="review-mine-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="review-mine-title" className="font-semibold">
            {t("title")}
          </h2>
          <StatusBadge status={meta} label={status(meta.labelKey)} size="sm" />
        </div>
        <Stars rating={review.rating} label={t("rating", { count: review.rating })} />
        {review.body ? (
          <p className="whitespace-pre-line" lang={review.language} data-testid="review-mine-body">
            {review.body}
          </p>
        ) : (
          <p className="text-muted text-sm italic">{t("erased")}</p>
        )}
        <p className="text-muted text-sm">{t("meta", { tenure, date: formatDate(review.submittedAt, locale) })}</p>
        {review.ownerReply ? (
          <div className="bg-bg-subtle rounded-card flex flex-col gap-1 p-3" data-testid="review-owner-reply">
            <p className="text-sm font-semibold">{t("reply")}</p>
            <p className="text-sm whitespace-pre-line">{review.ownerReply}</p>
            {review.ownerRepliedAt ? (
              <p className="text-muted text-xs">{formatDate(review.ownerRepliedAt, locale)}</p>
            ) : null}
          </div>
        ) : null}
      </Card>

      {canWithdraw(review) ? <WithdrawReview leaseId={leaseId} /> : null}
    </div>
  );
}
