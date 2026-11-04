import { loadAnnouncements, loadParcels } from "@/features/resident/community/data";
import { loadContracts, loadRenewalOffers } from "@/features/resident/contracts/data";
import { homeContractRows } from "@/features/resident/contracts/HomeContracts";
import { pageLocale } from "@/features/resident/lease/data";
import { loadOpenInvoices } from "@/features/resident/invoices/data";
import { bangkokToday } from "@/features/resident/invoices/model";
import { ResidentHome } from "@/features/resident/home/ResidentHome";
import { ResidentShell } from "@/features/resident/shell/ResidentShell";
import { getActor } from "@/lib/auth/actor";
import { leaseAllowed } from "@/lib/auth/units";
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
 * invoices, the latest notifications and (GL3) documents to sign and offers to renew, loaded in parallel. JRL: the
 * home of the unit on screen follows my role there (`actor.home`); a co-owner's and a household member's home also
 * read the latest announcements, and an offer to renew shows only on a unit whose lease I am a party of.
 */
export default async function HomePage() {
  const actor = await getActor();
  if (actor.status !== "signed-in") return null;
  const billing = actor.entitlements.has("bills") && actor.unit !== null;
  const notices = actor.home !== "resident" && actor.unit !== null && actor.entitlements.has("announcements");
  const [open, notifications, contracts, offers, locale, parcels, announcements] = await Promise.all([
    billing ? loadOpenInvoices() : Promise.resolve({ data: [] }),
    actor.unit ? latestNotifications().catch(() => []) : Promise.resolve([]),
    // GL3: documents to sign and offers to renew — extra, so a failure leaves the cards out.
    loadContracts().catch(() => ({ data: [] })),
    loadRenewalOffers().catch(() => ({ data: [] })),
    pageLocale(),
    // The count on the parcels tile — extra, so a failure leaves it out.
    actor.unit && actor.entitlements.has("parcels")
      ? loadParcels().catch(() => ({ data: [] }))
      : Promise.resolve({ data: [] }),
    // JRL: the latest notices on the co-owner's and the household's home — extra, a failure leaves the list empty.
    notices ? loadAnnouncements().catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
  ]);
  // An offer to renew is lease-bound: only on a unit whose lease I am a party of (D-322). Without the unit list (its
  // fallback lists no leases) every offer stays, as before JR.
  const unitOffers = (offers.data ?? []).filter(
    (offer) => actor.unit === null || actor.unit.leaseIds.length === 0 || leaseAllowed(actor.unit, offer.leaseId),
  );
  const waitingParcels = (parcels.data ?? []).filter((p) => p.status === "received" || p.status === "notified").length;
  return (
    <ResidentShell active="home">
      <ResidentHome
        me={actor.me}
        unit={actor.unit}
        entitlements={actor.entitlements}
        capabilities={actor.capabilities}
        kind={actor.home}
        notices={announcements.data ?? []}
        openInvoices={open.data ?? null}
        notifications={notifications}
        today={bangkokToday()}
        vapidKey={serverEnv().NEXT_PUBLIC_VAPID_PUBLIC_KEY}
        waitingParcels={waitingParcels}
        todo={await homeContractRows({
          contracts: contracts.data ?? [],
          offers: actor.home === "resident" ? unitOffers : [],
          locale,
        })}
      />
    </ResidentShell>
  );
}
