"use client";

import { lazyWarm } from "@/ui/lib/lazy";
import { WhenNear } from "@/features/shared/WhenNear";

const WorkOrderPhotos = lazyWarm(() => import("./WorkOrderPhotos").then((m) => m.WorkOrderPhotos));

/**
 * The before / after photo pickers sit below the actions: loaded as they come near the screen, so the work order
 * opens within its 180 KB budget (D-179; the shared chunks grew with the GL3 contract adoption).
 */
export function LazyWorkOrderPhotos({ workOrderId, role }: { workOrderId: string; role: "before" | "after" }) {
  return (
    <WhenNear fallbackClassName="h-24 w-full" testId={`wo-photos-slot-${role}`}>
      <WorkOrderPhotos workOrderId={workOrderId} role={role} />
    </WhenNear>
  );
}
