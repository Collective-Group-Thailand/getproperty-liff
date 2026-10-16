import { getTranslations } from "next-intl/server";

import { EmptyState } from "@/ui/components/EmptyState";

/** L4 placeholder: the list of `work_order`s assigned to the signed-in technician party. */
export async function TechnicianWorkOrders() {
  const t = await getTranslations("technician");
  return (
    <div className="flex flex-col gap-4 py-6" data-testid="technician-home">
      <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
      <EmptyState icon="ticket" title={t("empty")} />
    </div>
  );
}
