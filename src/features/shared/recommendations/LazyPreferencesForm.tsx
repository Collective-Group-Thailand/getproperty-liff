"use client";

import { WhenNear } from "@/features/shared/WhenNear";
import type { Locale } from "@/i18n/routing";
import { lazyWarm } from "@/ui/lib/lazy";

import type { PublicArea, Recommendations, RecommendationsAudience } from "./model";

type Props = {
  audience: RecommendationsAudience;
  data: Recommendations;
  areas: PublicArea[] | null;
  locale: Locale;
};

const PreferencesForm = lazyWarm<Props>(() => import("./PreferencesForm").then((m) => m.PreferencesForm));

/**
 * The preferences form (inputs, area search, the consent checkbox) sits under the status and the consent text: loaded
 * as it comes near the screen, so `/recommendations` opens within its 180 KB budget (D-179).
 */
export function LazyPreferencesForm(props: Props) {
  return (
    <WhenNear fallbackClassName="h-[1200px] w-full" testId="recommendations-form-slot">
      <PreferencesForm {...props} />
    </WhenNear>
  );
}
