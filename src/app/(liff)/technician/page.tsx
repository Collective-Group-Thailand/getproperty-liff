import { getTranslations } from "next-intl/server";
import { notFound, redirect } from "next/navigation";

import { TechnicianShell } from "@/features/technician/TechnicianShell";
import { TechnicianWorkOrders } from "@/features/technician/TechnicianWorkOrders";
import { ProblemPage } from "@/features/shared/ProblemNotice";
import { getTechnician } from "@/lib/auth/actor";
import { technicianEnabled } from "@/lib/flags";
import { LIFF_STATE_PARAM } from "@/lib/liff/deepLink";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("technician.workOrders");
  return { title: t("title") };
}

/**
 * "My work orders" for external technicians (R2, audience `technician`, `/v1/technician/*`). Hidden behind
 * `FEATURE_TECHNICIAN=1` until L4; technicians sign in with LINE only, and never see the resident bottom nav.
 */
export default async function TechnicianPage() {
  if (!technicianEnabled()) notFound();
  const actor = await getTechnician();
  if (actor.status === "anonymous") redirect(`/liff?${LIFF_STATE_PARAM}=${encodeURIComponent("/technician")}`);
  return (
    <TechnicianShell>
      {actor.status === "error" ? <ProblemPage error={actor.error} /> : <TechnicianWorkOrders me={actor.me} />}
    </TechnicianShell>
  );
}
