import { loadOpenInvoices } from "@/features/resident/invoices/data";
import { bangkokToday } from "@/features/resident/invoices/model";
import { ResidentHome } from "@/features/resident/home/ResidentHome";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { getActor } from "@/lib/auth/actor";
import { serverEnv } from "@/lib/env";
import { serverApi } from "@/lib/api/server";
import type { InboxItem } from "@/lib/api/types";

/** The three newest notifications on home; the inbox page is L4. A failure leaves the section out (it is extra). */
async function latestNotifications(): Promise<InboxItem[]> {
  const api = await serverApi();
  const { data } = await api.GET("/v1/resident/notifications", { params: { query: { limit: 3 } } });
  return data?.data ?? [];
}

/**
 * Resident home, from `/v1/resident/me` (the `(resident)` layout has already checked session and consent), my open
 * invoices and the latest notifications, loaded in parallel.
 */
export default async function HomePage() {
  const actor = await getActor();
  if (actor.status !== "signed-in") return null;
  const billing = actor.entitlements.has("bills") && actor.unit !== null;
  const [open, notifications] = await Promise.all([
    billing ? loadOpenInvoices() : Promise.resolve({ data: [] }),
    actor.unit ? latestNotifications().catch(() => []) : Promise.resolve([]),
  ]);
  return (
    <ResidentShell active="home">
      <ResidentHome
        me={actor.me}
        unit={actor.unit}
        entitlements={actor.entitlements}
        openInvoices={open.data ?? null}
        notifications={notifications}
        today={bangkokToday()}
        vapidKey={serverEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY}
      />
    </ResidentShell>
  );
}
