"use client";

import type { ComponentProps } from "react";

import { WhenNear } from "@/features/shared/WhenNear";
import { lazyWarm } from "@/ui/lib/lazy";

import type { RentRecordSharePanel as Panel } from "./RentRecordSharePanel";

const RentRecordSharePanel = lazyWarm(() => import("./RentRecordSharePanel").then((m) => m.RentRecordSharePanel));

/**
 * Sharing my rent record sits under the viewing (and, in GL2, the door-code panel): loaded as it comes near the
 * screen, so the enquiry page opens within its 180 KB budget (D-179).
 */
export function LazyRentRecordSharePanel(props: ComponentProps<typeof Panel>) {
  return (
    <WhenNear fallbackClassName="h-40 w-full" testId="enquiry-rent-record-slot">
      <RentRecordSharePanel {...props} />
    </WhenNear>
  );
}
