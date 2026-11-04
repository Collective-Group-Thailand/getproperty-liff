import { getTranslations } from "next-intl/server";

import { pageLocale } from "@/features/resident/lease/data";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { loadWorkOrder } from "@/features/technician/data";
import { TechnicianShell } from "@/features/technician/TechnicianShell";
import { WorkOrderDetail } from "@/features/technician/WorkOrderDetail";

export async function generateMetadata() {
  const t = await getTranslations("technician.workOrders");
  return { title: t("title") };
}

/**
 * One work order of mine (L4 4.4 §2) — 404 from the API when it is not assigned to me. A record screen: "‹ My work
 * orders" in the top bar and the job's next step docked on the bottom edge.
 */
export default async function WorkOrderPage({ params }: { params: Promise<{ workOrderId: string }> }) {
  const [{ workOrderId }, locale, t] = await Promise.all([
    params,
    pageLocale(),
    getTranslations("technician.workOrders"),
  ]);
  const loaded = await loadWorkOrder(workOrderId);
  return (
    <TechnicianShell back={{ href: "/technician", label: t("detail.back") }}>
      {loaded.error ? (
        <ProblemPage error={loaded.error} />
      ) : (
        <WorkOrderDetail workOrder={loaded.data} locale={locale} />
      )}
    </TechnicianShell>
  );
}
