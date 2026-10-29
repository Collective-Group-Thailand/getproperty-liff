"use client";

import { WhenNear } from "@/features/shared/WhenNear";
import type { Locale } from "@/i18n/routing";
import { lazyWarm } from "@/ui/lib/lazy";

type Props = { leaseId: string; consentVersion: number; consentText: React.ReactNode; locale: Locale };

const ReviewForm = lazyWarm<Props>(() => import("./ReviewForm").then((m) => m.ReviewForm));

/** The review form (and its checkbox) loads as it comes near the screen: `/lease/<id>/review` stays ≤ 180 KB (D-179). */
export function LazyReviewForm(props: Props) {
  return (
    <WhenNear fallbackClassName="h-[640px] w-full" testId="review-form-slot">
      <ReviewForm {...props} />
    </WhenNear>
  );
}
