/**
 * JRL (D-309, D-322) in the mock API: my units and roles, the usage of a unit I live in, and the co-owner's unit
 * invitation (preview → OTP to the register's phone → accept). Mock invitation codes (mock builds only):
 *
 *   OWN-OK…        valid; accepted once per account (then `invitation.not_pending`) — adds C-1203, or C-0805 when
 *                  C-1203 is already mine
 *   OWN-USED…      used / revoked / expired (409 `invitation.not_pending`)
 *   OWN-MISMATCH…  the register's party is another LINE account's (409 `invitation.party_mismatch` at accept)
 *   OWN-NOPHONE…   the register has no phone (preview `phoneMasked: null`; 422 `invitation.phone_missing` at OTP)
 *   OWN-RATE…      the phone had too many codes (429 `auth.otp_rate_limited` at OTP)
 *   anything else  404 `invitation.not_found`
 *
 * OTP `123456` is right, `000000` has expired; five wrong codes end the challenge (`auth.otp_attempts_exceeded`).
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { forgetBilling } from "./billing";
import { mswPath, problem } from "./contract";
import { authenticate } from "./handlers";
import { residenceOf, usageSeries } from "./residence";
import { usageSummary } from "./resident";
import { CONDO_UNIT, type MockAccount, type OwnedUnit } from "./state";
import { bangkokIso } from "./tokens";
import { meUnits } from "./unitRoles";

type Schemas = components["schemas"];

export const UNIT_OTP = "123456";
export const UNIT_OTP_EXPIRED = "000000";
const UNIT_OTP_MAX_ATTEMPTS = 5;
/** Seconds before another code can be sent (the API's `OTP_RESEND_SECONDS`). */
export const UNIT_OTP_RESEND_SECONDS = 30;

/** A second unit of the same condominium, for an account that already co-owns C-1203. */
export const CONDO_UNIT_2: OwnedUnit = {
  ...CONDO_UNIT,
  unitId: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
  unitNo: "C-0805",
  from: "2026-11-01",
};

interface UnitStore {
  /** `userId|code` of invitations this account accepted. */
  accepted: Set<string>;
  /** challengeId → the code it belongs to and the wrong tries so far. */
  challenges: Map<string, { userId: string; code: string; attempts: number }>;
  /** `userId|code|key` → the accepted answer (Idempotency-Key replay). */
  replays: Map<string, Schemas["UnitInvitationAcceptedDto"]>;
}
const holder = globalThis as typeof globalThis & { __gpMockUnits?: UnitStore };
holder.__gpMockUnits ??= { accepted: new Set(), challenges: new Map(), replays: new Map() };
const store = holder.__gpMockUnits;

type Kind = "ok" | "used" | "mismatch" | "nophone" | "rate";

function kindOf(code: string): Kind | null {
  const match = /^OWN-(OK|USED|MISMATCH|NOPHONE|RATE)/.exec(code.toUpperCase());
  return match ? (match[1]!.toLowerCase() as Kind) : null;
}

function nextOwned(account: MockAccount): OwnedUnit {
  return account.owned.some((o) => o.unitId === CONDO_UNIT.unitId) ? CONDO_UNIT_2 : CONDO_UNIT;
}

/** The invitation as the resident may see it, or the problem of the operation. */
function invitation(account: MockAccount, code: string, op: string): { kind: Kind; unit: OwnedUnit } | Response {
  const kind = kindOf(code);
  if (!kind) return problem(op, "invitation.not_found");
  if (kind === "used" || store.accepted.has(`${account.userId}|${code}`)) return problem(op, "invitation.not_pending");
  return { kind, unit: nextOwned(account) };
}

async function json<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export const unitHandlers: HttpHandler[] = [
  http.get(mswPath("/v1/resident/me/units"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.units.list");
    if (auth instanceof Response) return auth;
    return HttpResponse.json(meUnits(auth.account, auth.session));
  }),

  // Usage of a unit I live in (any occupancy role, no lease needed); owned-only or unknown → 404 (D-322).
  http.get(mswPath("/v1/resident/units/:unitId/usage"), ({ request, params }) => {
    const op = "resident.units.usage";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unit = auth.account.units.find((u) => u.unitId === params.unitId);
    if (!unit) return problem(op, "http.not_found");
    const url = new URL(request.url);
    const bucket = (url.searchParams.get("bucket") ?? "1d") as "15m" | "1h" | "1d";
    if (!["15m", "1h", "1d"].includes(bucket)) return problem(op, "validation.failed");
    const to = url.searchParams.get("to") ? Date.parse(url.searchParams.get("to")!) : Date.now();
    const from = url.searchParams.get("from") ? Date.parse(url.searchParams.get("from")!) : to - 30 * 86_400_000;
    if (Number.isNaN(from) || Number.isNaN(to) || from >= to) return problem(op, "validation.failed");
    const residence = residenceOf(auth.account);
    return HttpResponse.json({
      unitId: unit.unitId,
      bucket,
      from: bangkokIso(from),
      to: bangkokIso(to),
      series: usageSeries(residence, from, to, bucket),
      summary: usageSummary(residence, from, to, bucket),
    } satisfies Schemas["ResidentUnitUsageDto"]);
  }),

  http.get(mswPath("/v1/resident/unit-invitations/:code"), ({ request, params }) => {
    const op = "resident.unitInvitations.preview";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = invitation(auth.account, String(params.code), op);
    if (found instanceof Response) return found;
    return HttpResponse.json({
      tenantName: found.unit.tenantName,
      buildingName: found.unit.buildingName,
      unitNo: found.unit.unitNo,
      partyDisplayName: "สม••••••",
      phoneMasked: found.kind === "nophone" ? null : "+66•••••1234",
      expiresAt: bangkokIso(Date.now() + 14 * 86_400_000),
    } satisfies Schemas["UnitInvitationPreviewDto"]);
  }),

  http.post(mswPath("/v1/resident/unit-invitations/:code/otp"), ({ request, params }) => {
    const op = "resident.unitInvitations.requestOtp";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const code = String(params.code);
    const found = invitation(auth.account, code, op);
    if (found instanceof Response) return found;
    if (found.kind === "nophone") return problem(op, "invitation.phone_missing");
    if (found.kind === "rate") return problem(op, "auth.otp_rate_limited");
    const now = Date.now();
    const challengeId = crypto.randomUUID();
    store.challenges.set(challengeId, { userId: auth.account.userId, code, attempts: 0 });
    return HttpResponse.json(
      {
        challengeId,
        expiresAt: bangkokIso(now + 5 * 60_000),
        resendAvailableAt: bangkokIso(now + UNIT_OTP_RESEND_SECONDS * 1000),
        phoneMasked: "+66•••••1234",
      } satisfies Schemas["ResidentSignatureOtpDto"],
      { status: 201 },
    );
  }),

  http.post(mswPath("/v1/resident/unit-invitations/:code/accept"), async ({ request, params }) => {
    const op = "resident.unitInvitations.accept";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const { account } = auth;
    const code = String(params.code);
    const key = request.headers.get("idempotency-key");
    const replay = key ? store.replays.get(`${account.userId}|${code}|${key}`) : undefined;
    if (replay) return HttpResponse.json(replay, { headers: { "idempotent-replayed": "true" } });
    const body = await json<{ challengeId?: unknown; code?: unknown }>(request);
    if (typeof body?.challengeId !== "string" || typeof body.code !== "string") return problem(op, "validation.failed");
    const found = invitation(account, code, op);
    if (found instanceof Response) return found;
    if (!account.consents.every((c) => !c.required || (c.granted === true && c.grantedVersion === c.version)))
      return problem(op, "consent.required");
    const pending = store.challenges.get(body.challengeId);
    if (!pending || pending.userId !== account.userId || pending.code !== code || body.code === UNIT_OTP_EXPIRED)
      return problem(op, "auth.otp_expired");
    if (body.code !== UNIT_OTP) {
      pending.attempts += 1;
      if (pending.attempts >= UNIT_OTP_MAX_ATTEMPTS) {
        store.challenges.delete(body.challengeId);
        return problem(op, "auth.otp_attempts_exceeded");
      }
      return problem(op, "auth.otp_invalid", { attemptsRemaining: UNIT_OTP_MAX_ATTEMPTS - pending.attempts });
    }
    store.challenges.delete(body.challengeId);
    if (found.kind === "mismatch") return problem(op, "invitation.party_mismatch");
    store.accepted.add(`${account.userId}|${code}`);
    if (!account.owned.some((o) => o.unitId === found.unit.unitId)) account.owned.push(found.unit);
    // The common-fee bills of the new unit are seeded with the others on the next read.
    forgetBilling(account);
    const accepted: Schemas["UnitInvitationAcceptedDto"] = {
      tenantId: found.unit.tenantId,
      unitId: found.unit.unitId,
      partyId: crypto.randomUUID(),
      refreshRequired: true,
      acceptedOn: bangkokIso(Date.now()).slice(0, 10),
    };
    if (key) store.replays.set(`${account.userId}|${code}|${key}`, accepted);
    return HttpResponse.json(accepted);
  }),
];
