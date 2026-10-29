import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { REVIEW_STATUS } from "@/domain/status/growth";
import { formatDate } from "@/i18n/format";
import type { Locale } from "@/i18n/routing";
import { StatusBadge } from "@/ui/components/Badge";
import { Button } from "@/ui/components/Button";
import { Card } from "@/ui/components/Card";
import { IconEdit } from "@/ui/icons/glyphs/edit";
import { IconForward } from "@/ui/icons/glyphs/forward";

import { reviewEntry, type ResidentReview } from "./model";

/**
 * *Review this building* on the lease page (D-301): write one once tenure is verified, the first day while it is too
 * early, my review's state once written. Nothing when I never lived under this lease or the window closed.
 */
export async function LeaseReviewEntry({
  leaseId,
  view,
  locale,
}: {
  leaseId: string;
  view: ResidentReview;
  locale: Locale;
}) {
  const entry = reviewEntry(view);
  if (entry.kind === "none") return null;
  const [t, status] = await Promise.all([getTranslations("resident.reviews.entry"), getTranslations()]);
  const href = `/lease/${leaseId}/review`;
  return (
    <Card
      as="section"
      padding="md"
      aria-labelledby="lease-review-title"
      data-testid="lease-review"
      data-kind={entry.kind}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="lease-review-title" className="font-semibold">
          {t("title")}
        </h2>
        {entry.kind === "mine" ? (
          <StatusBadge
            status={REVIEW_STATUS[entry.review.state]}
            label={status(REVIEW_STATUS[entry.review.state].labelKey)}
            size="sm"
          />
        ) : null}
      </div>
      <p className="text-muted mt-1 text-sm">
        {entry.kind === "write"
          ? t("write")
          : entry.kind === "wait"
            ? entry.from
              ? t("waitFrom", { date: formatDate(entry.from, locale, { style: "long" }) })
              : t("wait")
            : t("mine")}
      </p>
      {entry.kind !== "wait" ? (
        <div className="mt-3">
          <Button
            asChild
            variant={entry.kind === "write" ? "primary" : "secondary"}
            size="lg"
            block
            iconStart={entry.kind === "write" ? IconEdit : undefined}
            iconEnd={IconForward}
          >
            <Link href={href} data-testid="lease-review-open">
              {entry.kind === "write" ? t("writeCta") : t("mineCta")}
            </Link>
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
