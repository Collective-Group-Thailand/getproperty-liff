/**
 * Feature flags read from the server environment at request time (not `NEXT_PUBLIC_*`, so a flag can
 * be flipped per deployment without a rebuild). L1 replaces these with the entitlements in
 * `/v1/resident/me` and `/v1/technician/me`.
 */
export function technicianEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FEATURE_TECHNICIAN === "1";
}
