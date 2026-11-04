"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/ui/components/Button";
import { IconAdd } from "@/ui/icons/glyphs/add";
import { lazyWarm } from "@/ui/lib/lazy";
import { WhenNear } from "@/features/shared/WhenNear";

const CostLineForm = lazyWarm(() => import("./CostLineForm").then((m) => m.CostLineForm));

/**
 * The cost-line form sits at the end of the work order behind one outlined "add a cost" button (redesign G2 r2: the
 * job page reads as a record, not as a form), and loads as it comes near the screen, so the page opens within its
 * 180 KB budget (D-179).
 */
export function LazyCostLineForm({ workOrderId }: { workOrderId: string }) {
  const t = useTranslations("technician.workOrders.costs");
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        variant="secondary"
        size="lg"
        block
        iconStart={IconAdd}
        onClick={() => setOpen(true)}
        data-testid="cost-open"
      >
        {t("add")}
      </Button>
    );
  }
  return (
    <WhenNear fallbackClassName="h-40 w-full" testId="cost-form-slot">
      <CostLineForm workOrderId={workOrderId} />
    </WhenNear>
  );
}
