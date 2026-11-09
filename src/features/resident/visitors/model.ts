import type {
  GatePolicyAction,
  InviteVisitorKind,
  Plate,
  ResidentUnitCapability,
  ResidentUnitRole,
  ResidentVisit,
  VisitInviteCreate,
  VisitState,
} from "@/lib/api/types";

/**
 * JL4 — visitors at the gate (D-315, D-327), pure: who may see and change what, the countdown to the house policy,
 * what the result card says, the `?answer=` deep link and the invite form. No I/O; the screens and the tests share it.
 */

/** Roles that set the house policy, create invites and register cars (D-327, D-328): not family. */
const HOUSEHOLD_ROLES: ReadonlySet<ResidentUnitRole> = new Set(["co_owner", "tenant", "co_tenant"]);

type Roles = { roles: readonly { role: ResidentUnitRole }[] };

/**
 * The visitors tab for this unit: the API's `gate` capability (CR #49, D-335) — the unit's estate has an active gate
 * and I hold a gate role (co-owner, tenant, co-tenant, family).
 */
export function gateUnit(unit: { capabilities: readonly ResidentUnitCapability[] } | null | undefined): boolean {
  return Boolean(unit?.capabilities.includes("gate"));
}

/** May I set the policy, create invites and register cars? The API's `canEdit` wins when it is known. */
export function canEditGate(unit: Roles | null | undefined, apiCanEdit?: boolean): boolean {
  if (apiCanEdit !== undefined) return apiCanEdit;
  return Boolean(unit && unit.roles.some((r) => HOUSEHOLD_ROLES.has(r.role)));
}

// ---------------------------------------------------------------------------------------------------------------
// Countdown and the house policy line

/** Whole seconds until `respondBy` (never negative); `null` when the visit has no clock. */
export function secondsLeft(respondBy: string | null | undefined, now: number): number | null {
  if (!respondBy) return null;
  const at = Date.parse(respondBy);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - now) / 1000));
}

/** `m:ss` — the countdown in the lede (tabular, mono). */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface PolicyLine {
  action: GatePolicyAction;
  minutes: number;
}

/**
 * What happens if nobody answers, in the API's own words (`policyLineTh` of the LINE message): the action snapshot
 * on the visit (`timeoutAction`, else the house policy), and the minutes of the house clock — `respondBy − createdAt`
 * as the message counts them, else the policy's `timeoutSeconds`. Rounded, never below one minute.
 */
export function policyLine(
  visit: Pick<ResidentVisit, "timeoutAction" | "policy" | "respondBy" | "createdAt">,
): PolicyLine {
  const action = visit.timeoutAction ?? visit.policy.action;
  let seconds = visit.policy.timeoutSeconds;
  if (visit.respondBy) {
    const span = (Date.parse(visit.respondBy) - Date.parse(visit.createdAt)) / 1000;
    if (Number.isFinite(span) && span > 0) seconds = span;
  }
  return { action, minutes: Math.max(1, Math.round(seconds / 60)) };
}

/**
 * The estate's `gate.remember_days` from `ResidentGateDto.rememberDays` (CR #50, D-335); `null` when the unit's gate
 * could not be read (the copy then names no number).
 */
export function rememberDays(gate: { rememberDays: number } | null | undefined): number | null {
  const value = gate?.rememberDays;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Result card

export type ResultKind =
  "approved" | "denied" | "timed_out" | "entered" | "exited" | "cancelled" | "call_me" | "waiting";

export interface VisitResult {
  kind: ResultKind;
  /** Who of the household answered (the API's `decidedByName`); `null` for the house policy, the guard, the system. */
  by: string | null;
  /** When it happened (decided, entered, exited, cancelled, asked to call). */
  at: string | null;
  /** Another answer came first (`accepted: false` of my answer). */
  someoneElse: boolean;
  /** For a timeout: what the house policy did. */
  policy: GatePolicyAction | null;
}

/**
 * The result card after any answer (J-DESIGN §3): who answered and when. A later state wins (entered after approved,
 * exited after entered); a timeout says what the house policy did; `call_me` is not a decision — the actions stay.
 */
export function resultOf(
  visit: Pick<
    ResidentVisit,
    | "state"
    | "decidedByName"
    | "decidedAt"
    | "enteredAt"
    | "exitedAt"
    | "cancelledAt"
    | "callMeAt"
    | "timeoutAction"
    | "policy"
  >,
  accepted?: boolean,
): VisitResult {
  const someoneElse = accepted === false;
  const base = { by: visit.decidedByName, someoneElse, policy: null };
  switch (visit.state) {
    case "requested":
      return visit.callMeAt ? { ...base, kind: "call_me", at: visit.callMeAt } : { ...base, kind: "waiting", at: null };
    case "approved":
      return { ...base, kind: "approved", at: visit.decidedAt };
    case "denied":
      return { ...base, kind: "denied", at: visit.decidedAt };
    case "timed_out":
      return {
        ...base,
        by: null,
        kind: "timed_out",
        at: visit.decidedAt,
        policy: visit.timeoutAction ?? visit.policy.action,
      };
    case "entered":
      return { ...base, kind: "entered", at: visit.enteredAt };
    case "exited":
      return { ...base, kind: "exited", at: visit.exitedAt };
    case "cancelled":
      return { ...base, kind: "cancelled", at: visit.cancelledAt };
  }
}

/** A visit still waiting for the household. */
export function waiting(state: VisitState): boolean {
  return state === "requested";
}

// ---------------------------------------------------------------------------------------------------------------
// The LINE buttons: `/visits/{id}?answer=approve|deny|call_me`

export type Answer = "approve" | "deny" | "call_me";
const ANSWERS: readonly Answer[] = ["approve", "deny", "call_me"];

export function parseAnswer(raw: string | string[] | null | undefined): Answer | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return ANSWERS.find((a) => a === value) ?? null;
}

/**
 * What a deep-linked answer does on arrival: never act silently on a link (a preview bot, a forwarded message, a
 * mistaken tap) — `confirm` opens a confirmation naming the plate; a visit no longer waiting shows its result
 * (`answered`) and the link's answer is dropped.
 */
export function deepLinkStep(answer: Answer | null, state: VisitState): "confirm" | "answered" | null {
  if (!answer) return null;
  return waiting(state) ? "confirm" : "answered";
}

// ---------------------------------------------------------------------------------------------------------------
// Plates

/** "3กท 8812" — category and number as printed on the plate; the province is shown on its own. */
export function plateText(plate: Pick<Plate, "category" | "number"> | null | undefined): string {
  return plate ? `${plate.category} ${plate.number}` : "";
}

/** The API's plate rules (gate-rules `normalisePlate`): category 1–4 digits / Thai consonants with a consonant. */
const CATEGORY = /^[0-9ก-ฮ]{1,4}$/;
const HAS_CONSONANT = /[ก-ฮ]/;
const NUMBER = /^[0-9]{1,4}$/;

export type PlateError = "partial" | "category" | "number" | "province";

/**
 * A full plate, none at all, or the first field that is wrong (spaces and dashes dropped, as the API does). A plate
 * is optional on an invite and required for a household car (`required`).
 */
export function checkPlate(
  input: { category: string; number: string; province: string },
  required = false,
): { plate: Plate | null } | { error: PlateError; field: "category" | "number" | "province" } {
  const category = input.category.replace(/[\s-]/g, "");
  const number = input.number.replace(/[\s-]/g, "");
  const province = input.province.trim().replace(/\s+/g, " ");
  if (!category && !number && !province) {
    return required ? { error: "partial", field: "category" } : { plate: null };
  }
  if (!CATEGORY.test(category) || !HAS_CONSONANT.test(category)) return { error: "category", field: "category" };
  if (!NUMBER.test(number)) return { error: "number", field: "number" };
  if (province.length < 1 || province.length > 60) return { error: "province", field: "province" };
  return { plate: { category, number, province } };
}

// ---------------------------------------------------------------------------------------------------------------
// Invites (D-327 (5))

export interface InviteDraft {
  visitorKind: InviteVisitorKind;
  usage: "single" | "multi";
  fromDate: string;
  fromTime: string;
  toDate: string;
  toTime: string;
  maxUses: string;
  visitorName: string;
  note: string;
  plateCategory: string;
  plateNumber: string;
  plateProvince: string;
}

export type InviteField =
  "fromDate" | "toDate" | "maxUses" | "visitorName" | "note" | "plateCategory" | "plateNumber" | "plateProvince";

export type InviteError =
  "required" | "order" | "past" | "window" | "range" | "tooLong" | "partial" | "category" | "number" | "province";

export const INVITE_LIMITS = { minUses: 2, maxUses: 100, defaultUses: 10, name: 120, note: 300 } as const;

/** `2026-11-06` + `09:30` → `2026-11-06T09:30:00+07:00` (the estate's clock is Bangkok's). */
export function bangkokInstant(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const iso = `${date}T${time}:00+07:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * The invite form's own checks (the contract's limits): a window in order and not already over, uses 2–100 for a
 * multi-use invite, a full plate or none, name ≤ 120, note ≤ 300, and a window no longer than the estate's
 * `gate.invite_max_days` (`ResidentGateDto.inviteMaxDays`, CR #51) when known — the API's 422 still answers otherwise.
 * Returns the errors by field, or the body to send.
 */
export function validateInvite(
  draft: InviteDraft,
  now: number,
  maxDays?: number | null,
): { errors: Partial<Record<InviteField, InviteError>>; body: VisitInviteCreate | null } {
  const errors: Partial<Record<InviteField, InviteError>> = {};
  const from = bangkokInstant(draft.fromDate, draft.fromTime);
  const to = bangkokInstant(draft.toDate, draft.toTime);
  if (!from) errors.fromDate = "required";
  if (!to) errors.toDate = "required";
  else if (from && Date.parse(to) <= Date.parse(from)) errors.toDate = "order";
  else if (Date.parse(to) <= now) errors.toDate = "past";
  else if (from && maxDays && Date.parse(to) - Date.parse(from) > maxDays * 86_400_000) errors.toDate = "window";

  let maxUses: number | undefined;
  if (draft.usage === "multi") {
    const n = Number(draft.maxUses.trim());
    if (!draft.maxUses.trim() || !Number.isInteger(n) || n < INVITE_LIMITS.minUses || n > INVITE_LIMITS.maxUses) {
      errors.maxUses = "range";
    } else maxUses = n;
  }
  const name = draft.visitorName.trim();
  if (name.length > INVITE_LIMITS.name) errors.visitorName = "tooLong";
  const note = draft.note.trim();
  if (note.length > INVITE_LIMITS.note) errors.note = "tooLong";

  const plate = checkPlate({
    category: draft.plateCategory,
    number: draft.plateNumber,
    province: draft.plateProvince,
  });
  if ("error" in plate) {
    const field =
      plate.field === "category" ? "plateCategory" : plate.field === "number" ? "plateNumber" : "plateProvince";
    errors[field] = plate.error;
  }

  if (Object.keys(errors).length || !from || !to) return { errors, body: null };
  const body: VisitInviteCreate = { usage: draft.usage, visitorKind: draft.visitorKind, validFrom: from, validTo: to };
  if (maxUses !== undefined) body.maxUses = maxUses;
  if (name) body.visitorName = name;
  if (note) body.note = note;
  if ("plate" in plate && plate.plate) body.plate = plate.plate;
  return { errors, body };
}

/** The order of the invite form's fields — the error summary focuses the first wrong one. */
export const INVITE_FIELD_ORDER: readonly InviteField[] = [
  "fromDate",
  "toDate",
  "maxUses",
  "visitorName",
  "plateCategory",
  "plateNumber",
  "plateProvince",
  "note",
];

/** A sensible first window: from now (rounded up to the next quarter hour) for four hours, Bangkok time. */
export function defaultWindow(now: number): Pick<InviteDraft, "fromDate" | "fromTime" | "toDate" | "toTime"> {
  const quarter = 15 * 60_000;
  const start = Math.ceil(now / quarter) * quarter;
  const end = start + 4 * 3_600_000;
  const parts = (at: number) => {
    const local = new Date(at + 7 * 3_600_000).toISOString();
    return { date: local.slice(0, 10), time: local.slice(11, 16) };
  };
  const a = parts(start);
  const b = parts(end);
  return { fromDate: a.date, fromTime: a.time, toDate: b.date, toTime: b.time };
}

/** The `/pass#…` link that draws the invite's QR in the visitor's browser (the token stays in the fragment). */
export function passUrl(
  origin: string,
  pass: { token: string; unit: string; from: string; to: string; place?: string },
): string {
  const params = new URLSearchParams({ t: pass.token, u: pass.unit, f: pass.from, e: pass.to });
  if (pass.place) params.set("p", pass.place);
  return `${origin}/pass#${params.toString()}`;
}

/** Reads `/pass#…`; `null` unless the token looks like the API's (`gpv1.` + base64url). */
export function readPass(
  hash: string,
): { token: string; unit: string; from: string; to: string; place: string | null } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const token = params.get("t") ?? "";
  if (!/^gpv1\.[A-Za-z0-9_-]{8,}$/.test(token)) return null;
  return {
    token,
    unit: params.get("u") ?? "",
    from: params.get("f") ?? "",
    to: params.get("e") ?? "",
    place: params.get("p"),
  };
}

/** The Bangkok calendar day of an instant (`YYYY-MM-DD`). */
export function bangkokDay(iso: string): string {
  return new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10);
}
