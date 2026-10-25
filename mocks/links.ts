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

import type { components } from "../src/lib/api/schema";

import { forgetBilling } from "./billing";
import { forgetCommunity } from "./community";
import { mswPath, problem } from "./contract";
import { emit } from "./events";
import { authenticate, residentMe } from "./handlers";
import { forgetResidence } from "./residence";
import { forgetServiceSeed } from "./service";
import { bangkokIso } from "./tokens";

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

  // ── an operator's own LINE OA (D-254): the OA replied with `/link/oa?t=…`; the resident confirms here ──
  // Mock tokens: `mock-oa-valid…` can be used once, `mock-oa-expired…`, `mock-oa-used…`, `mock-oa-taken…` (the OA
  // user is already someone else's); anything else is unknown.
  http.get(mswPath("/v1/resident/messaging-links/:token"), ({ request, params }) => {
    const op = "resident.messagingLinks.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const link = oaLink(auth.account.userId, String(params.token));
    return link ? HttpResponse.json(link) : problem(op, "messaging.link_invalid");
  }),

  http.post(mswPath("/v1/resident/messaging-links/:token/actions/confirm"), ({ request, params }) => {
    const op = "resident.messagingLinks.confirm";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const token = String(params.token);
    const link = oaLink(auth.account.userId, token);
    if (!link) return problem(op, "messaging.link_invalid");
    if (link.state === "used") return problem(op, "messaging.link_used");
    if (link.state === "expired") return problem(op, "messaging.link_expired");
    if (token.startsWith("mock-oa-taken")) return problem(op, "messaging.line_user_taken");
    usedOaLinks.add(`${auth.account.userId}|${token}`);
    return HttpResponse.json({ ...link, state: "used" });
  }),
];

/** On `globalThis` like the rest of the mock state: Next bundles the BFF and the pages separately. */
const oaHolder = globalThis as typeof globalThis & { __gpMockOaLinks?: Set<string> };
const usedOaLinks = (oaHolder.__gpMockOaLinks ??= new Set<string>());

function oaLink(userId: string, token: string): components["schemas"]["MessagingLinkDto"] | null {
  const kind = /^mock-oa-(valid|expired|used|taken)/.exec(token)?.[1];
  if (!kind) return null;
  const used = kind === "used" || usedOaLinks.has(`${userId}|${token}`);
  return {
    tenantName: "บ้านเช่าสมใจ",
    botName: "บ้านเช่าสมใจ",
    botPictureUrl: null,
    expiresAt: bangkokIso(Date.now() + (kind === "expired" ? -60_000 : 25 * 60_000)),
    state: used ? "used" : kind === "expired" ? "expired" : "valid",
  };
}

/** `party.link_changed` on the login's `user:` channel, like the API's (ids only; the party is not modelled here). */
function linkChanged(userId: string): void {
  emit(userId, "party.link_changed", {
    eventId: crypto.randomUUID(),
    aggregateType: "party",
    aggregateId: crypto.randomUUID(),
  });
}
