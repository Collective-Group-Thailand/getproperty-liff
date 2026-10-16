import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

import { TechnicianWorkOrders } from "@/features/technician/TechnicianWorkOrders";
import { technicianEnabled } from "@/lib/flags";
import { AppShell, TopBar } from "@/ui/components/AppShell";
import { Wordmark } from "@/ui/brand";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("technician");
  return { title: t("title") };
}

/**
 * "My work orders" for external technicians (R2, audience `technician`, `/v1/technician/*`). Hidden
 * behind `FEATURE_TECHNICIAN=1` until L4; a technician never sees the resident bottom nav.
 */
export default async function TechnicianPage() {
  if (!technicianEnabled()) notFound();
  const t = await getTranslations("shell");
  return (
    <AppShell
      variant="mobile"
      skipLabel={t("skipToContent")}
      header={
        <TopBar>
          <Wordmark size="sm" />
        </TopBar>
      }
    >
      <TechnicianWorkOrders />
    </AppShell>
  );
}
