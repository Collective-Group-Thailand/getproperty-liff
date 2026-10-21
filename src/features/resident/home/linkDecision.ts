import { scopesStale } from "@/lib/auth/scopes";

/** The realtime event of a link decision on the login's own `user:` channel (D-228, LIFF #31). */
export const LINK_CHANGED_EVENT = "party.link_changed";

/**
 * Marks the "check again" link that `LinkPendingWatch` takes over once hydrated. Lives here, not in the client
 * module: a server component importing a value from a "use client" file gets a client reference, not the string.
 */
export const LINK_CHECK_ATTRIBUTE = "data-link-check";

/**
 * What became of the resident's phone-match link requests (D-226) since the page was rendered, read from a fresh
 * `GET /v1/resident/me` (D-228: the realtime `party.link_changed` carries ids and type only — whether the office
 * confirmed or declined is told by `/me`, never by the event):
 *
 * - `confirmed` — `/me` lists a unit the page did not have, or one the token does not cover yet: rotate the session
 *   through `/auth/rescope` (the unit's scopes arrive only with a new token) and come back.
 * - `declined` — nothing waits any more and still no unit: the office declined (the reason stays with the office).
 * - `changed` — fewer requests wait but something else is still pending or linked: re-render the page.
 * - `waiting` — nothing was decided yet.
 */
export type LinkDecision = "confirmed" | "declined" | "changed" | "waiting";

export interface LinkSnapshot {
  /** `linkRequestsPending` when the page was rendered. */
  pending: number;
  /** The units the page was rendered with. */
  unitIds: readonly string[];
}

export interface MeForDecision {
  linkRequestsPending: number;
  units: readonly { unitId: string }[];
  leaseIds: readonly string[];
  scopes: readonly string[];
}

export function linkDecision(before: LinkSnapshot, me: MeForDecision): LinkDecision {
  const known = new Set(before.unitIds);
  if (me.units.some((unit) => !known.has(unit.unitId)) || scopesStale(me)) return "confirmed";
  if (me.linkRequestsPending >= before.pending) return "waiting";
  return me.linkRequestsPending === 0 && me.units.length === 0 ? "declined" : "changed";
}
