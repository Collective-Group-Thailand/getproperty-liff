"use client";

import { WhenNear } from "@/features/shared/WhenNear";
import type { Locale } from "@/i18n/routing";
import { lazyWarm } from "@/ui/lib/lazy";

import type { PublicArea, RelocationOffer } from "./model";

type Props = { offer: Pick<RelocationOffer, "id" | "destination">; areas: PublicArea[] | null; locale: Locale };

const DestinationForm = lazyWarm<Props>(() => import("./DestinationForm").then((m) => m.DestinationForm));

/** The destination form loads as it comes near the screen, so `/relocation/<id>` opens within 180 KB (D-179). */
export function LazyDestinationForm(props: Props) {
  return (
    <WhenNear fallbackClassName="h-[420px] w-full" testId="relocation-destination-slot">
      <DestinationForm {...props} />
    </WhenNear>
  );
}
