import { safeInternalPath } from "@/lib/liff/deepLink";

/**
 * The browser-safe half of the scope sync (`./rescope.ts` holds the rotation itself): the guard, the route handler
 * and the pending-link card on home (D-226, D-228) share these, so the card's client bundle never pulls the
 * refresh code in.
 */
export const RESCOPE_COOKIE = "gp_rescoped";
/** Seconds the marker lives: one rotation per half minute at most. */
export const RESCOPE_MARKER_SECONDS = 30;
export const RESCOPE_PATH = "/auth/rescope";

/** True when `/me` lists a unit or a lease the token's scopes do not cover yet. */
export function scopesStale(me: {
  scopes: readonly string[];
  units: readonly { unitId: string }[];
  leaseIds: readonly string[];
}): boolean {
  const held = new Set(me.scopes);
  return (
    me.units.some((unit) => !held.has(`unit:${unit.unitId}`)) || me.leaseIds.some((id) => !held.has(`lease:${id}`))
  );
}

export function rescopePath(next: string): string {
  return `${RESCOPE_PATH}?next=${encodeURIComponent(safeInternalPath(next))}`;
}
