/**
 * JL4 — the gate in the mock API (api J4.1 + J4.2, D-315 … D-317, D-327, D-328): visits of my units with the house
 * policy and first-answer-wins, invites (QR token once), remembered and household cars, the house policy, opening the
 * barrier (rate limit, optional geofence) and SOS (existing open SOS returned, 30-s cancel window). Shapes are the
 * contract's; the gate exists for units of a juristic estate (C-1203 condo, 88/12 housing estate).
 *
 * Scenario words in the fake LINE subject (with `…coowner…`, `…village…`, `…housefamily…` of `mocks/state.ts`):
 *
 *   …visitor…    a visitor waits at the gate (guest, plate 3กท 8812, photo from the gate camera, 3-minute policy)
 *   …nophoto…    with …visitor…: no photo of that visit
 *   …mycar…      one registered household car (opens the barrier); …twocars… two
 *   …geofence…   the estate asks for the phone location to open (inside: the mock estate's point)
 *   …gateoff…    the estate does not let residents open the barrier (`gate.resident_open.enabled` false)
 *   …quietgate…  no visits, invites or remembered cars yet
 *
 * Mock-only controls (never in the contract or a real build):
 *   `POST /v1/resident/__mock/units/{unitId}/visits` {kind?, plate?, visitorName?, photo?, timeoutSeconds?} — the guard
 *   records a visit that asks the household; `POST /v1/resident/__mock/visits/{visitId}/answer` {answer, name} — another
 *   member of the household answers first; `POST /v1/resident/__mock/sos/{incidentId}/acknowledge` — the guard takes it.
 */
import { http, HttpResponse, type HttpHandler, type JsonBodyType } from "msw";

import type { components } from "../src/lib/api/schema";
import { mswPath, problem } from "./contract";
import { authenticate } from "./handlers";
import type { MockAccount } from "./state";
import { bangkokIso } from "./tokens";
import { myUnitsOf } from "./unitRoles";

type Schemas = components["schemas"];
type Visit = Schemas["ResidentVisitDto"];
type Invite = Schemas["VisitInviteDto"];
type Remembered = Schemas["RememberedVehicleDto"];
type Car = Schemas["ResidentVehicleDto"];
type Policy = Schemas["HousePolicyDto"];
type Incident = Schemas["ResidentIncidentDto"];
type MeUnit = Schemas["ResidentMeUnitDto"];

const DAY = 86_400_000;
const MIN = 60_000;
const REMEMBER_DAYS = 30;
const INVITE_MAX_DAYS = 30;
const OPEN_INTERVAL_MS = 3000;
const SOS_CANCEL_MS = 30_000;
/** The mock estate's point (Prawet, Bangkok) and the geofence radius of `gate.resident_open.radius_m`. */
export const ESTATE_POINT = { lat: 13.6905, lng: 100.6851 };
const RADIUS_M = 300;

const GATE_ROLES = new Set(["co_owner", "tenant", "co_tenant", "family"]);
const HOUSEHOLD = new Set(["co_owner", "tenant", "co_tenant"]);
const DEFAULT_POLICY: Policy = {
  timeoutSeconds: 180,
  action: "guard_calls",
  deliverySkipApproval: null,
  householdNote: null,
  custom: false,
};
const PRIVACY = {
  version: 1,
  th: "ร่าง ⚖ — นิติบุคคลเก็บทะเบียนรถ ชื่อผู้มาติดต่อ (ถ้าให้) และรูปจากกล้องที่ป้อม เพื่อความปลอดภัยของโครงการ เก็บไว้ 90 วันแล้วลบ",
  en: "Draft ⚖ — the juristic person keeps the plate, the visitor's name (if given) and the gate camera photo for the estate's security, for 90 days, then deletes them.",
  retentionDays: 90,
};

interface GateStore {
  visits: Visit[];
  invites: Invite[];
  remembered: Remembered[];
  cars: Car[];
  policies: Map<string, Policy>;
  incidents: (Incident & { raisedBy: string })[];
  lastOpen: Map<string, number>;
  replays: Map<string, { status: number; body: JsonBodyType }>;
}
const holder = globalThis as typeof globalThis & { __gpMockGate?: Map<string, GateStore> };
holder.__gpMockGate ??= new Map();
const stores = holder.__gpMockGate;

function has(account: MockAccount, word: string): boolean {
  return account.subject.toLowerCase().includes(word);
}

/** Stable uuid-like ids from a seed (mock gates and seeded rows keep their ids across reloads). */
export function idFrom(seed: string): string {
  let h = 0x811c9dc5;
  const out: string[] = [];
  for (let round = 0; round < 4; round += 1) {
    for (const ch of `${seed}#${round}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
    out.push(h.toString(16).padStart(8, "0"));
  }
  const hex = out.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Units on which I hold a gate role, in a juristic estate. */
function gateUnits(account: MockAccount): MeUnit[] {
  return myUnitsOf(account).filter((u) => u.legalForm !== null && u.roles.some((r) => GATE_ROLES.has(r.role)));
}
function gateUnit(account: MockAccount, unitId: string): MeUnit | undefined {
  return gateUnits(account).find((u) => u.unitId === unitId);
}
function household(unit: MeUnit): boolean {
  return unit.roles.some((r) => HOUSEHOLD.has(r.role));
}

/** The gates of an estate: a housing estate has a main and a back gate, a condominium one front gate. */
export function gatesOf(propertyId: string, kind: MeUnit["propertyKind"]): Schemas["GateRefDto"][] {
  return kind === "village"
    ? [
        { id: idFrom(`${propertyId}#gate1`), name: "ป้อม 1", kind: "main" },
        { id: idFrom(`${propertyId}#gate2`), name: "ป้อม 2 ประตูหลัง", kind: "side" },
      ]
    : [{ id: idFrom(`${propertyId}#gate1`), name: "ป้อมหน้า", kind: "main" }];
}

/** A gate-camera frame as a data URL — a mock stand-in for the API's 5-minute photo link (never a stock image). */
function cameraFrame(plate: string, _at?: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#3a4250"/><rect y="250" width="640" height="110" fill="#2b313b"/><rect x="40" y="120" width="560" height="10" fill="#c9ced6"/><rect x="190" y="170" width="260" height="120" rx="18" fill="#9aa3b1"/><rect x="215" y="140" width="210" height="60" rx="14" fill="#7d8796"/><rect x="270" y="245" width="100" height="26" rx="3" fill="#eef0f3"/><text x="320" y="264" font-family="sans-serif" font-size="15" text-anchor="middle" fill="#1d2330">${plate}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function hhmm(epoch: number): string {
  return new Date(epoch + 7 * 3_600_000).toISOString().slice(11, 16);
}

function newVisit(
  unit: MeUnit,
  gate: Schemas["GateRefDto"],
  fields: Partial<Visit> & { at: number },
  policy: Policy,
): Visit {
  const { at, ...rest } = fields;
  return {
    id: crypto.randomUUID(),
    gateId: gate.id,
    gateName: gate.name,
    unitId: unit.unitId,
    unitNo: unit.unitNo,
    kind: "guest",
    state: "requested",
    entryBasis: null,
    plate: null,
    visitorName: null,
    hasPhoto: false,
    respondBy: null,
    timeoutAction: null,
    decidedAt: null,
    decisionReason: null,
    callMeAt: null,
    enteredAt: null,
    exitedAt: null,
    exitedBy: null,
    cancelledAt: null,
    createdAt: bangkokIso(at),
    decidedByName: null,
    policy,
    photoUrl: null,
    ...rest,
  };
}

function storeOf(account: MockAccount): GateStore {
  const existing = stores.get(account.userId);
  if (existing) return existing;
  const store: GateStore = {
    visits: [],
    invites: [],
    remembered: [],
    cars: [],
    policies: new Map(),
    incidents: [],
    lastOpen: new Map(),
    replays: new Map(),
  };
  stores.set(account.userId, store);
  const now = Date.now();
  for (const unit of gateUnits(account)) {
    const [gate] = gatesOf(unit.propertyId, unit.propertyKind);
    if (!gate) continue;
    const policy = policyOf(store, unit.unitId);
    if (!has(account, "quietgate")) {
      // Today: a parcel courier in and out this morning; yesterday: a guest the household let in.
      store.visits.push(
        newVisit(
          unit,
          gate,
          {
            at: now - 5 * 3_600_000,
            kind: "delivery",
            state: "exited",
            entryBasis: "approval",
            plate: { category: "2ฒษ", number: "4417", province: "กรุงเทพมหานคร" },
            visitorName: "ส่งพัสดุ",
            decidedAt: bangkokIso(now - 5 * 3_600_000 + MIN),
            decidedByName: account.displayName,
            enteredAt: bangkokIso(now - 5 * 3_600_000 + 2 * MIN),
            exitedAt: bangkokIso(now - 5 * 3_600_000 + 14 * MIN),
            exitedBy: "guard",
          },
          policy,
        ),
        newVisit(
          unit,
          gate,
          {
            at: now - DAY - 2 * 3_600_000,
            kind: "guest",
            state: "exited",
            entryBasis: "approval",
            plate: { category: "7กษ", number: "205", province: "นนทบุรี" },
            visitorName: "คุณมาลี",
            decidedAt: bangkokIso(now - DAY - 2 * 3_600_000 + MIN),
            decidedByName: "คุณวิภา",
            enteredAt: bangkokIso(now - DAY - 2 * 3_600_000 + 3 * MIN),
            exitedAt: bangkokIso(now - DAY + 3_600_000),
            exitedBy: "resident",
          },
          policy,
        ),
        newVisit(
          unit,
          gate,
          {
            at: now - 3 * DAY,
            kind: "contractor",
            state: "denied",
            plate: { category: "ฒค", number: "9021", province: "สมุทรปราการ" },
            visitorName: null,
            decidedAt: bangkokIso(now - 3 * DAY + 40_000),
            decidedByName: account.displayName,
          },
          policy,
        ),
      );
      store.remembered.push({
        id: idFrom(`${unit.unitId}#remembered1`),
        unitId: unit.unitId,
        kind: "visitor",
        plate: { category: "1กข", number: "1234", province: "กรุงเทพมหานคร" },
        label: "รถพี่สาว",
        expiresAt: bangkokIso(now + 12 * DAY),
      });
      store.invites.push(
        {
          id: idFrom(`${unit.unitId}#invite1`),
          unitId: unit.unitId,
          unitNo: unit.unitNo,
          usage: "multi",
          visitorKind: "other",
          state: "active",
          validFrom: bangkokIso(now - 2 * DAY),
          validTo: bangkokIso(now + 12 * DAY),
          maxUses: 20,
          uses: 6,
          plate: null,
          visitorName: "แม่บ้าน (คุณสมใจ)",
          note: null,
          rejectReason: null,
          createdAt: bangkokIso(now - 2 * DAY),
        },
        {
          id: idFrom(`${unit.unitId}#invite2`),
          unitId: unit.unitId,
          unitNo: unit.unitNo,
          usage: "single",
          visitorKind: "contractor",
          state: "pending_approval",
          validFrom: bangkokIso(now + DAY),
          validTo: bangkokIso(now + DAY + 8 * 3_600_000),
          maxUses: 1,
          uses: 0,
          plate: { category: "3ฒข", number: "5521", province: "ปทุมธานี" },
          visitorName: "ช่างแอร์",
          note: "ล้างแอร์ 3 เครื่อง",
          rejectReason: null,
          createdAt: bangkokIso(now - 3_600_000),
        },
      );
    }
    if (has(account, "visitor")) {
      const at = now - 72_000;
      const plate = { category: "3กท", number: "8812", province: "กรุงเทพมหานคร" };
      store.visits.push(
        newVisit(
          unit,
          gate,
          {
            // A stable id per unit (stores are per account): the Lighthouse set measures `/visits/<this id>`.
            id: idFrom(`${unit.unitId}#waiting`),
            at,
            kind: "guest",
            plate,
            visitorName: "คุณธนา",
            hasPhoto: !has(account, "nophoto"),
            photoUrl: has(account, "nophoto") ? null : cameraFrame("3กท 8812", `${hhmm(at)} น.`),
            respondBy: bangkokIso(at + policy.timeoutSeconds * 1000),
            timeoutAction: policy.action,
          },
          policy,
        ),
      );
    }
    if (has(account, "mycar") || has(account, "twocars")) {
      store.cars.push({
        id: idFrom(`${unit.unitId}#car1`),
        unitId: unit.unitId,
        plate: { category: "8กร", number: "1288", province: "กรุงเทพมหานคร" },
        label: "รถของฉัน",
        createdAt: bangkokIso(now - 40 * DAY),
      });
      if (has(account, "twocars")) {
        store.cars.push({
          id: idFrom(`${unit.unitId}#car2`),
          unitId: unit.unitId,
          plate: { category: "ขพ", number: "407", province: "สมุทรปราการ" },
          label: "รถคุณแม่",
          createdAt: bangkokIso(now - 20 * DAY),
        });
      }
    }
  }
  return store;
}

function policyOf(store: GateStore, unitId: string): Policy {
  return store.policies.get(unitId) ?? DEFAULT_POLICY;
}

/** The `gate-visits` sweep, applied on every read: a waiting visit past `respondBy` takes the house policy. */
function sweep(store: GateStore, now = Date.now()) {
  for (const v of store.visits) {
    if (v.state === "requested" && v.respondBy && Date.parse(v.respondBy) <= now) {
      v.state = "timed_out";
      v.decidedAt = v.respondBy;
      v.decisionReason = "timeout";
    }
  }
}

function replayed(store: GateStore, request: Request, scope: string): Response | null {
  const key = request.headers.get("idempotency-key");
  const hit = key ? store.replays.get(`${scope}|${key}`) : undefined;
  return hit ? HttpResponse.json(hit.body, { status: hit.status }) : null;
}
function remember(store: GateStore, request: Request, scope: string, status: number, body: JsonBodyType): Response {
  const key = request.headers.get("idempotency-key");
  if (key) store.replays.set(`${scope}|${key}`, { status, body });
  return HttpResponse.json(body, { status });
}

/** The list shape (`VisitDto`): the resident view without who answered, the policy or the photo link. */
function listView(v: Visit): Schemas["VisitDto"] {
  const out: Partial<Visit> = { ...v };
  delete out.decidedByName;
  delete out.policy;
  delete out.photoUrl;
  return out as Schemas["VisitDto"];
}

function gateView(store: GateStore, unit: MeUnit) {
  // CONTRACT-REQUEST #50: `rememberDays` (`gate.remember_days`) — not in the contract yet.
  return {
    unitId: unit.unitId,
    unitNo: unit.unitNo,
    policy: policyOf(store, unit.unitId),
    canEdit: household(unit),
    gates: gatesOf(unit.propertyId, unit.propertyKind),
    privacyNotice: PRIVACY,
    rememberDays: REMEMBER_DAYS,
  };
}

function token(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `gpv1.${Buffer.from(bytes).toString("base64url")}`;
}

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

function incidentView(i: GateStore["incidents"][number], userId: string, now = Date.now()): Incident {
  const { raisedBy, ...rest } = i;
  const until = Date.parse(i.createdAt) + SOS_CANCEL_MS;
  return {
    ...rest,
    cancellableUntil: raisedBy === userId && i.state === "open" && now < until ? bangkokIso(until) : null,
  };
}

function visitForMe(account: MockAccount, visitId: string): { store: GateStore; visit: Visit } | null {
  const store = storeOf(account);
  sweep(store);
  const visit = store.visits.find((v) => v.id === visitId);
  if (!visit || !visit.unitId || !gateUnit(account, visit.unitId)) return null;
  return { store, visit };
}

function answer(op: string, kind: "approve" | "deny" | "call_me") {
  return async ({
    request,
    params,
  }: {
    request: Request;
    params: Record<string, string | readonly string[] | undefined>;
  }) => {
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = visitForMe(auth.account, String(params.visitId));
    if (!found) return problem(op, "http.not_found");
    const { visit } = found;
    const me = auth.account.displayName;
    const body = (await request.json().catch(() => ({}))) as { rememberVehicle?: boolean };
    let accepted: boolean;
    if (kind === "call_me") {
      accepted = visit.state === "requested";
      if (accepted) visit.callMeAt = bangkokIso(Date.now());
    } else {
      const target = kind === "approve" ? "approved" : "denied";
      if (visit.state === "requested") {
        visit.state = target;
        visit.decidedAt = bangkokIso(Date.now());
        visit.decidedByName = me;
        accepted = true;
        if (kind === "approve" && body.rememberVehicle && visit.plate && visit.unitId) {
          const existing = found.store.remembered.find(
            (r) =>
              r.unitId === visit.unitId &&
              r.plate.number === visit.plate!.number &&
              r.plate.category === visit.plate!.category,
          );
          const expiresAt = bangkokIso(Date.now() + REMEMBER_DAYS * DAY);
          if (existing) existing.expiresAt = expiresAt;
          else
            found.store.remembered.push({
              id: crypto.randomUUID(),
              unitId: visit.unitId,
              kind: "visitor",
              plate: visit.plate,
              label: visit.visitorName,
              expiresAt,
            });
        }
      } else accepted = visit.state === target && visit.decidedByName === me;
    }
    return HttpResponse.json({ accepted, visit } satisfies Schemas["VisitAnswerResultDto"]);
  };
}

export const gateHandlers: HttpHandler[] = [
  http.get(mswPath("/v1/resident/visits"), ({ request }) => {
    const op = "resident.visits.list";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const store = storeOf(auth.account);
    sweep(store);
    const url = new URL(request.url);
    const unitId = url.searchParams.get("unitId");
    const state = url.searchParams.get("state");
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("perPage") ?? 25)));
    const mine = new Set(gateUnits(auth.account).map((u) => u.unitId));
    const rows = store.visits
      .filter(
        (v) => v.unitId && mine.has(v.unitId) && (!unitId || v.unitId === unitId) && (!state || v.state === state),
      )
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return HttpResponse.json({
      data: rows.slice((page - 1) * perPage, page * perPage).map(listView),
      meta: { page, perPage, total: rows.length },
    });
  }),

  http.get(mswPath("/v1/resident/visits/:visitId"), ({ request, params }) => {
    const op = "resident.visits.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = visitForMe(auth.account, String(params.visitId));
    if (!found) return problem(op, "http.not_found");
    // CONTRACT-REQUEST #50: `rememberDays` on the visit's policy.
    return HttpResponse.json({ ...found.visit, policy: { ...found.visit.policy, rememberDays: REMEMBER_DAYS } });
  }),

  http.post(mswPath("/v1/resident/visits/:visitId/actions/approve"), answer("resident.visits.approve", "approve")),
  http.post(mswPath("/v1/resident/visits/:visitId/actions/deny"), answer("resident.visits.deny", "deny")),
  http.post(mswPath("/v1/resident/visits/:visitId/actions/call-me"), answer("resident.visits.callMe", "call_me")),

  http.post(mswPath("/v1/resident/visits/:visitId/actions/exit"), ({ request, params }) => {
    const op = "resident.visits.exit";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = visitForMe(auth.account, String(params.visitId));
    if (!found) return problem(op, "http.not_found");
    if (found.visit.state !== "entered") return problem(op, "visit.invalid_state");
    Object.assign(found.visit, { state: "exited", exitedAt: bangkokIso(Date.now()), exitedBy: "resident" });
    return HttpResponse.json(found.visit);
  }),

  http.get(mswPath("/v1/resident/units/:unitId/gate"), ({ request, params }) => {
    const op = "resident.units.gate";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unit = gateUnit(auth.account, String(params.unitId));
    if (!unit) return problem(op, "http.not_found");
    return HttpResponse.json(gateView(storeOf(auth.account), unit));
  }),

  http.put(mswPath("/v1/resident/units/:unitId/gate-policy"), async ({ request, params }) => {
    const op = "resident.units.setGatePolicy";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unit = gateUnit(auth.account, String(params.unitId));
    if (!unit) return problem(op, "http.not_found");
    if (!household(unit)) return problem(op, "auth.forbidden");
    const body = (await request.json().catch(() => ({}))) as Schemas["HousePolicyUpdateDto"];
    const store = storeOf(auth.account);
    const current = policyOf(store, unit.unitId);
    const timeoutSeconds = body.timeoutSeconds ?? current.timeoutSeconds;
    if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 60 || timeoutSeconds > 900) {
      return problem(op, "validation.failed", {
        errors: [{ path: "timeoutSeconds", code: "range", message: "60–900 วินาที" }],
      });
    }
    if ((body.householdNote ?? "").length > 300) {
      return problem(op, "validation.failed", {
        errors: [{ path: "householdNote", code: "max", message: "ไม่เกิน 300 ตัวอักษร" }],
      });
    }
    store.policies.set(unit.unitId, {
      timeoutSeconds,
      action: body.action ?? current.action,
      deliverySkipApproval:
        body.deliverySkipApproval === undefined ? current.deliverySkipApproval : body.deliverySkipApproval,
      householdNote:
        body.householdNote === undefined
          ? current.householdNote
          : body.householdNote?.trim()
            ? body.householdNote.trim()
            : null,
      custom: true,
    });
    return HttpResponse.json(gateView(store, unit));
  }),

  http.get(mswPath("/v1/resident/units/:unitId/visit-invites"), ({ request, params }) => {
    const op = "resident.units.visitInvites";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unit = gateUnit(auth.account, String(params.unitId));
    if (!unit) return problem(op, "http.not_found");
    return HttpResponse.json(
      storeOf(auth.account)
        .invites.filter((i) => i.unitId === unit.unitId)
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    );
  }),

  http.post(mswPath("/v1/resident/units/:unitId/visit-invites"), async ({ request, params }) => {
    const op = "resident.units.createVisitInvite";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unit = gateUnit(auth.account, String(params.unitId));
    if (!unit) return problem(op, "http.not_found");
    if (!household(unit)) return problem(op, "auth.forbidden");
    const store = storeOf(auth.account);
    const again = replayed(store, request, `invite|${unit.unitId}`);
    if (again) return again;
    const body = (await request.json().catch(() => ({}))) as Schemas["VisitInviteCreateDto"];
    const from = Date.parse(body.validFrom);
    const to = Date.parse(body.validTo);
    if (Number.isNaN(from) || Number.isNaN(to) || to <= from) {
      return problem(op, "validation.failed", {
        errors: [{ path: "validTo", code: "after", message: "after validFrom" }],
      });
    }
    if (to - from > INVITE_MAX_DAYS * DAY)
      return problem(op, "visit_invite.window_too_long", { params: { days: INVITE_MAX_DAYS } });
    const maxUses = body.usage === "single" ? 1 : (body.maxUses ?? 10);
    if (body.usage === "multi" && (!Number.isInteger(maxUses) || maxUses < 2 || maxUses > 100)) {
      return problem(op, "validation.failed", {
        errors: [{ path: "maxUses", code: "range", message: "an integer 2–100 for a multi-use invite" }],
      });
    }
    const invite: Invite = {
      id: crypto.randomUUID(),
      unitId: unit.unitId,
      unitNo: unit.unitNo,
      usage: body.usage,
      visitorKind: body.visitorKind,
      state: body.visitorKind === "contractor" ? "pending_approval" : "active",
      validFrom: bangkokIso(from),
      validTo: bangkokIso(to),
      maxUses,
      uses: 0,
      plate: body.plate ?? null,
      visitorName: body.visitorName ?? null,
      note: body.note ?? null,
      rejectReason: null,
      createdAt: bangkokIso(Date.now()),
    };
    store.invites.push(invite);
    return remember(store, request, `invite|${unit.unitId}`, 201, { ...invite, token: token() });
  }),

  http.post(mswPath("/v1/resident/units/:unitId/visit-invites/:inviteId/actions/revoke"), ({ request, params }) => {
    const op = "resident.units.revokeVisitInvite";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unit = gateUnit(auth.account, String(params.unitId));
    if (!unit) return problem(op, "http.not_found");
    if (!household(unit)) return problem(op, "auth.forbidden");
    const invite = storeOf(auth.account).invites.find((i) => i.id === params.inviteId && i.unitId === unit.unitId);
    if (!invite) return problem(op, "http.not_found");
    if (invite.state === "active" || invite.state === "pending_approval") invite.state = "revoked";
    return HttpResponse.json(invite);
  }),

  http.get(mswPath("/v1/resident/units/:unitId/remembered-vehicles"), ({ request, params }) => {
    const op = "resident.units.rememberedVehicles";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unit = gateUnit(auth.account, String(params.unitId));
    if (!unit) return problem(op, "http.not_found");
    const now = Date.now();
    return HttpResponse.json(
      storeOf(auth.account).remembered.filter((r) => r.unitId === unit.unitId && Date.parse(r.expiresAt) > now),
    );
  }),

  http.post(mswPath("/v1/resident/units/:unitId/remembered-vehicles"), async ({ request, params }) => {
    const op = "resident.units.rememberVehicle";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unit = gateUnit(auth.account, String(params.unitId));
    if (!unit) return problem(op, "http.not_found");
    const body = (await request.json().catch(() => ({}))) as Schemas["RememberedVehicleCreateDto"];
    const row: Remembered = {
      id: crypto.randomUUID(),
      unitId: unit.unitId,
      kind: body.kind ?? "visitor",
      plate: body.plate,
      label: body.label ?? null,
      expiresAt: bangkokIso(Date.now() + Math.min(body.days ?? REMEMBER_DAYS, REMEMBER_DAYS) * DAY),
    };
    storeOf(auth.account).remembered.push(row);
    return HttpResponse.json(row, { status: 201 });
  }),

  http.delete(mswPath("/v1/resident/units/:unitId/remembered-vehicles/:vehicleId"), ({ request, params }) => {
    const op = "resident.units.forgetVehicle";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unit = gateUnit(auth.account, String(params.unitId));
    if (!unit) return problem(op, "http.not_found");
    const store = storeOf(auth.account);
    const index = store.remembered.findIndex((r) => r.id === params.vehicleId && r.unitId === unit.unitId);
    if (index < 0) return problem(op, "http.not_found");
    store.remembered.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(mswPath("/v1/resident/units/:unitId/vehicles"), ({ request, params }) => {
    const op = "resident.unitVehicles.list";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unit = gateUnit(auth.account, String(params.unitId));
    if (!unit) return problem(op, "http.not_found");
    return HttpResponse.json(storeOf(auth.account).cars.filter((c) => c.unitId === unit.unitId));
  }),

  http.post(mswPath("/v1/resident/units/:unitId/vehicles"), async ({ request, params }) => {
    const op = "resident.unitVehicles.create";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unit = gateUnit(auth.account, String(params.unitId));
    if (!unit) return problem(op, "http.not_found");
    if (!household(unit)) return problem(op, "auth.forbidden");
    const store = storeOf(auth.account);
    const again = replayed(store, request, `car|${unit.unitId}`);
    if (again) return again;
    const body = (await request.json().catch(() => ({}))) as Schemas["ResidentVehicleCreateDto"];
    if (
      store.cars.some(
        (c) =>
          c.unitId === unit.unitId &&
          c.plate.category === body.plate?.category &&
          c.plate.number === body.plate?.number,
      )
    ) {
      return problem(op, "http.conflict");
    }
    const car: Car = {
      id: crypto.randomUUID(),
      unitId: unit.unitId,
      plate: body.plate,
      label: body.label?.trim() || null,
      createdAt: bangkokIso(Date.now()),
    };
    store.cars.push(car);
    return remember(store, request, `car|${unit.unitId}`, 201, car);
  }),

  http.delete(mswPath("/v1/resident/units/:unitId/vehicles/:vehicleId"), ({ request, params }) => {
    const op = "resident.unitVehicles.delete";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unit = gateUnit(auth.account, String(params.unitId));
    if (!unit) return problem(op, "http.not_found");
    if (!household(unit)) return problem(op, "auth.forbidden");
    const store = storeOf(auth.account);
    const index = store.cars.findIndex((c) => c.id === params.vehicleId && c.unitId === unit.unitId);
    if (index < 0) return problem(op, "http.not_found");
    store.cars.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(mswPath("/v1/resident/gates"), ({ request }) => {
    const op = "resident.gates.list";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const store = storeOf(auth.account);
    const units = gateUnits(auth.account);
    const estates = new Map(units.map((u) => [u.propertyId, u]));
    const out: Schemas["ResidentOpenableGateDto"][] = [];
    for (const [propertyId, unit] of estates) {
      const vehicles = store.cars.filter((c) =>
        units.some((u) => u.unitId === c.unitId && u.propertyId === propertyId),
      );
      for (const gate of gatesOf(propertyId, unit.propertyKind)) {
        out.push({
          gateId: gate.id,
          name: gate.name,
          kind: gate.kind,
          propertyId,
          propertyName: unit.tenantName,
          enabled: !has(auth.account, "gateoff"),
          requireGeofence: has(auth.account, "geofence"),
          vehicles,
        });
      }
    }
    return HttpResponse.json(out);
  }),

  http.post(mswPath("/v1/resident/gates/:gateId/actions/open"), async ({ request, params }) => {
    const op = "resident.gates.open";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const store = storeOf(auth.account);
    const units = gateUnits(auth.account);
    const gateId = String(params.gateId);
    const unit = units.find((u) => gatesOf(u.propertyId, u.propertyKind).some((g) => g.id === gateId));
    const body = (await request.json().catch(() => ({}))) as Schemas["ResidentGateOpenDto"];
    const car = store.cars.find((c) => c.id === body.vehicleId && units.some((u) => u.unitId === c.unitId));
    if (!unit || !car) return problem(op, "http.not_found");
    if (has(auth.account, "gateoff")) return problem(op, "gate.resident_open_disabled");
    if (has(auth.account, "geofence")) {
      if (!body.location) {
        return problem(op, "validation.failed", {
          errors: [{ path: "location", code: "required", message: "location required" }],
        });
      }
      const slack = Math.min(100, body.location.accuracyM ?? 0);
      if (distanceM(body.location, ESTATE_POINT) > RADIUS_M + slack) return problem(op, "gate.outside_geofence");
    }
    const now = Date.now();
    const last = store.lastOpen.get(gateId) ?? 0;
    if (now - last < OPEN_INTERVAL_MS) {
      const response = problem(op, "gate.open_rate_limited");
      response.headers.set("retry-after", String(Math.ceil((OPEN_INTERVAL_MS - (now - last)) / 1000)));
      return response;
    }
    store.lastOpen.set(gateId, now);
    return HttpResponse.json(
      {
        gateId,
        commands: [
          {
            commandId: crypto.randomUUID(),
            gateDeviceId: idFrom(`${gateId}#barrier`),
            expiresAt: bangkokIso(now + 30_000),
          },
        ],
      } satisfies Schemas["GateOpenResultDto"],
      { status: 202 },
    );
  }),

  http.get(mswPath("/v1/resident/sos"), ({ request }) => {
    const op = "resident.sos.list";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unitId = new URL(request.url).searchParams.get("unitId");
    const mine = new Set(gateUnits(auth.account).map((u) => u.unitId));
    return HttpResponse.json(
      storeOf(auth.account)
        .incidents.filter((i) => i.unit && mine.has(i.unit.id) && (!unitId || i.unit.id === unitId))
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map((i) => incidentView(i, auth.account.userId)),
    );
  }),

  http.post(mswPath("/v1/resident/sos"), async ({ request }) => {
    const op = "resident.sos.create";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const store = storeOf(auth.account);
    const again = replayed(store, request, "sos");
    if (again) return again;
    const body = (await request.json().catch(() => ({}))) as Schemas["SosCreateDto"];
    const unit = gateUnit(auth.account, body.unitId);
    if (!unit) return problem(op, "http.not_found");
    const open = store.incidents.find(
      (i) =>
        i.unit?.id === unit.unitId &&
        i.raisedBy === auth.account.userId &&
        (i.state === "open" || i.state === "acknowledged"),
    );
    if (open)
      return remember(store, request, "sos", 201, { ...incidentView(open, auth.account.userId), existing: true });
    const incident = {
      id: crypto.randomUUID(),
      propertyId: unit.propertyId,
      propertyName: unit.tenantName,
      unit: { id: unit.unitId, unitNo: unit.unitNo },
      gate: null,
      kind: body.kind,
      source: "resident_sos" as const,
      state: "open" as const,
      note: body.note?.trim() || null,
      hasPhoto: false,
      visitCount: store.visits.filter((v) => v.state === "entered").length,
      createdAt: bangkokIso(Date.now()),
      acknowledgedAt: null,
      resolvedAt: null,
      cancelledAt: null,
      cancellableUntil: null,
      raisedBy: auth.account.userId,
    };
    store.incidents.push(incident);
    return remember(store, request, "sos", 201, { ...incidentView(incident, auth.account.userId), existing: false });
  }),

  http.get(mswPath("/v1/resident/sos/:incidentId"), ({ request, params }) => {
    const op = "resident.sos.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const mine = new Set(gateUnits(auth.account).map((u) => u.unitId));
    const incident = storeOf(auth.account).incidents.find(
      (i) => i.id === params.incidentId && i.unit && mine.has(i.unit.id),
    );
    if (!incident) return problem(op, "http.not_found");
    return HttpResponse.json(incidentView(incident, auth.account.userId));
  }),

  http.post(mswPath("/v1/resident/sos/:incidentId/actions/cancel"), async ({ request, params }) => {
    const op = "resident.sos.cancel";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const incident = storeOf(auth.account).incidents.find(
      (i) => i.id === params.incidentId && i.raisedBy === auth.account.userId,
    );
    if (!incident) return problem(op, "http.not_found");
    if (incident.state !== "open") return problem(op, "incident.invalid_state");
    if (Date.now() >= Date.parse(incident.createdAt) + SOS_CANCEL_MS)
      return problem(op, "incident.cancel_window_passed");
    incident.state = "cancelled";
    incident.cancelledAt = bangkokIso(Date.now());
    return HttpResponse.json(incidentView(incident, auth.account.userId));
  }),

  // ---- mock-only controls ------------------------------------------------------------------------------------
  http.post("*/v1/resident/__mock/units/:unitId/visits", async ({ request, params }) => {
    const auth = authenticate(request, "resident", "resident.visits.list");
    if (auth instanceof Response) return auth;
    const unit = gateUnit(auth.account, String(params.unitId));
    if (!unit) return HttpResponse.json({ code: "http.not_found" }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as {
      kind?: Visit["kind"];
      plate?: Schemas["PlateDto"] | null;
      visitorName?: string | null;
      photo?: boolean;
      timeoutSeconds?: number;
    };
    const store = storeOf(auth.account);
    const policy = policyOf(store, unit.unitId);
    const [gate] = gatesOf(unit.propertyId, unit.propertyKind);
    const at = Date.now();
    const plate =
      body.plate === undefined ? { category: "3กท", number: "8812", province: "กรุงเทพมหานคร" } : body.plate;
    const seconds = body.timeoutSeconds ?? policy.timeoutSeconds;
    const visit = newVisit(
      unit,
      gate!,
      {
        at,
        kind: body.kind ?? "guest",
        plate,
        visitorName: body.visitorName === undefined ? "คุณธนา" : body.visitorName,
        hasPhoto: body.photo ?? false,
        photoUrl: body.photo && plate ? cameraFrame(`${plate.category} ${plate.number}`, `${hhmm(at)} น.`) : null,
        respondBy: bangkokIso(at + seconds * 1000),
        timeoutAction: policy.action,
      },
      policy,
    );
    store.visits.push(visit);
    return HttpResponse.json(visit, { status: 201 });
  }),

  http.post("*/v1/resident/__mock/visits/:visitId/answer", async ({ request, params }) => {
    const auth = authenticate(request, "resident", "resident.visits.get");
    if (auth instanceof Response) return auth;
    const found = visitForMe(auth.account, String(params.visitId));
    if (!found) return HttpResponse.json({ code: "http.not_found" }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { answer?: "approve" | "deny"; name?: string };
    if (found.visit.state === "requested") {
      found.visit.state = body.answer === "deny" ? "denied" : "approved";
      found.visit.decidedAt = bangkokIso(Date.now());
      found.visit.decidedByName = body.name ?? "คุณวิภา";
    }
    return HttpResponse.json(found.visit);
  }),

  http.post("*/v1/resident/__mock/sos/:incidentId/acknowledge", ({ request, params }) => {
    const auth = authenticate(request, "resident", "resident.sos.get");
    if (auth instanceof Response) return auth;
    const incident = storeOf(auth.account).incidents.find((i) => i.id === params.incidentId);
    if (!incident) return HttpResponse.json({ code: "http.not_found" }, { status: 404 });
    if (incident.state === "open") {
      incident.state = "acknowledged";
      incident.acknowledgedAt = bangkokIso(Date.now());
    }
    return HttpResponse.json(incidentView(incident, auth.account.userId));
  }),
];
