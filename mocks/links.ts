/**
 * Party link requests in the mock API (D-226). An SMS-verified phone links nothing by itself: the resident's or the
 * technician's matched party waits for the tenant's Owner (`GET /v1/owner/party-link-requests`, `…/actions/confirm`
 * on the owner surface — not this app's). The mock plays the Owner with mock-only controls (never in the contract,
 * never in a real build):
 *
 *   POST /v1/resident/__mock/link-requests/confirm     the Owner confirms every pending match of this resident
 *   POST /v1/resident/__mock/link-requests/reject      the Owner rejects every pending match of this resident
 *   POST /v1/technician/__mock/link-requests/confirm   the same for a technician
 *
 * Each decision is heard on the login's `user:` channel as `party.link_changed` (D-228: ids and type only — whether
 * it was confirmed or rejected is read from `/me`, never from the event).
 *
 * Like the API, the login sees the parties in `/me` at once, while its access token carries the new `unit:` /
 * `lease:` scopes only after the next refresh (`MockSession.scopes`).
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import { forgetBilling } from "./billing";
import { forgetCommunity } from "./community";
import { mswPath } from "./contract";
import { emit } from "./events";
import { authenticate, residentMe } from "./handlers";
import { forgetResidence } from "./residence";
import { forgetServiceSeed } from "./service";

export const linkHandlers: HttpHandler[] = [
  http.post(mswPath("/v1/resident/__mock/link-requests/confirm"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.me.get");
    if (auth instanceof Response) return auth;
    const { account } = auth;
    const decided = account.pendingUnits.length;
    for (const unit of account.pendingUnits) {
      if (!account.units.some((u) => u.unitId === unit.unitId)) account.units.push(unit);
    }
    account.pendingUnits = [];
    // The party's lease, bills, requests and parcels are seeded again for the units it now holds.
    forgetResidence(account);
    forgetBilling(account);
    forgetCommunity(account);
    forgetServiceSeed(account);
    for (let i = 0; i < decided; i += 1) linkChanged(account.userId);
    return HttpResponse.json(residentMe(account, auth.session));
  }),

  http.post(mswPath("/v1/resident/__mock/link-requests/reject"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.me.get");
    if (auth instanceof Response) return auth;
    const decided = auth.account.pendingUnits.length;
    auth.account.pendingUnits = [];
    for (let i = 0; i < decided; i += 1) linkChanged(auth.account.userId);
    return HttpResponse.json(residentMe(auth.account, auth.session));
  }),

  http.post(mswPath("/v1/technician/__mock/link-requests/confirm"), ({ request }) => {
    const auth = authenticate(request, "technician", "technician.me.get");
    if (auth instanceof Response) return auth;
    if (auth.account.technicianPending) linkChanged(auth.account.userId);
    auth.account.technicianPending = false;
    return new HttpResponse(null, { status: 204 });
  }),
];

/** `party.link_changed` on the login's `user:` channel, like the API's (ids only; the party is not modelled here). */
function linkChanged(userId: string): void {
  emit(userId, "party.link_changed", {
    eventId: crypto.randomUUID(),
    aggregateType: "party",
    aggregateId: crypto.randomUUID(),
  });
}
