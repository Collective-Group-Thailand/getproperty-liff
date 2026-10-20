import { getTranslations } from "next-intl/server";

import { pageLocale } from "@/features/resident/lease/data";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { currentTime } from "@/features/shared/time";
import { loadWorkOrders } from "@/features/technician/data";
import { TechnicianWorkOrders } from "@/features/technician/TechnicianWorkOrders";
import { getTechnician } from "@/lib/auth/actor";

export async function generateMetadata() {
  const t = await getTranslations("technician.workOrders");
  return { title: t("title") };
}

/** "My work orders" for external technicians (R2, audience `technician`, `/v1/technician/*`, L4 4.4). */
export default async function TechnicianPage() {
  const [actor, locale] = await Promise.all([getTechnician(), pageLocale()]);
  if (actor.status !== "signed-in") return null;
  const loaded = await loadWorkOrders();
  return loaded.error ? (
    <ProblemPage error={loaded.error} />
  ) : (
    <TechnicianWorkOrders me={actor.me} items={loaded.data} locale={locale} now={currentTime()} />
  );
}
