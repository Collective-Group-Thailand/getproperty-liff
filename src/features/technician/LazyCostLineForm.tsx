"use client";

import { lazyWarm } from "@/ui/lib/lazy";
import { WhenNear } from "@/features/shared/WhenNear";

const CostLineForm = lazyWarm(() => import("./CostLineForm").then((m) => m.CostLineForm));

/**
 * The cost-line form sits at the end of the work order: loaded as it comes near the screen, so the page opens within
 * its 180 KB budget (D-179; the shared chunks grew with the GL3 contract adoption).
 */
export function LazyCostLineForm({ workOrderId }: { workOrderId: string }) {
  return (
    <WhenNear fallbackClassName="h-40 w-full" testId="cost-form-slot">
      <CostLineForm workOrderId={workOrderId} />
    </WhenNear>
  );
}
