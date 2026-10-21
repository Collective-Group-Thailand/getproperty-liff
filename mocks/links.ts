/**
 * Party link requests in the mock API (D-226). An SMS-verified phone links nothing by itself: the resident's or the
 * technician's matched party waits for the tenant's Owner (`GET /v1/owner/party-link-requests`, `…/actions/confirm`
 * on the owner surface — not this app's). The mock plays the Owner with mock-only controls (never in the contract,
 * never in a real build):
 *
 *   POST /v1/resident/__mock/link-requests/confirm     the Owner confirms every pending match of this resident
 *   POST /v1/technician/__mock/link-requests/confirm   the same for a technician
 *
 * Like the API, the login sees the parties in `/me` at once, while its access token carries the new `unit:` /
 * `lease:` scopes only after the next refresh (`MockSession.scopes`).
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import { forgetBilling } from "./billing";
import { forgetCommunity } from "./community";
import { mswPath } from "./contract";
import { authenticate, residentMe } from "./handlers";
import { forgetResidence } from "./residence";
import { forgetServiceSeed } from "./service";

export const linkHandlers: HttpHandler[] = [
  http.post(mswPath("/v1/resident/__mock/link-requests/confirm"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.me.get");
    if (auth instanceof Response) return auth;
    const { account } = auth;
    for (const unit of account.pendingUnits) {
      if (!account.units.some((u) => u.unitId === unit.unitId)) account.units.push(unit);
    }
    account.pendingUnits = [];
    // The party's lease, bills, requests and parcels are seeded again for the units it now holds.
    forgetResidence(account);
    forgetBilling(account);
    forgetCommunity(account);
    forgetServiceSeed(account);
    return HttpResponse.json(residentMe(account, auth.session));
  }),

  http.post(mswPath("/v1/technician/__mock/link-requests/confirm"), ({ request }) => {
    const auth = authenticate(request, "technician", "technician.me.get");
    if (auth instanceof Response) return auth;
    auth.account.technicianPending = false;
    return new HttpResponse(null, { status: 204 });
  }),
];
