import { getTranslations } from "next-intl/server";

import type { TechnicianMe } from "@/lib/api/types";
import { EmptyState } from "@/ui/components/EmptyState";
import { IconTicket } from "@/ui/icons/glyphs/ticket";

/**
 * L4 placeholder of the technician's list, already on `/v1/technician/me`: the greeting and the work orders the
 * token covers (`workOrderIds`, empty until B5).
 */
export async function TechnicianWorkOrders({ me }: { me: TechnicianMe }) {
  const t = await getTranslations("technician.workOrders");
  return (
    <div className="flex flex-col gap-4 py-6" data-testid="technician-home">
      <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted">{t("greeting", { name: me.user.displayName })}</p>
      {me.workOrderIds.length === 0 ? (
        <EmptyState icon={IconTicket} title={t("empty")} description={t("body")} />
      ) : null}
    </div>
  );
}
