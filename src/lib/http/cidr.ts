import { BlockList, isIP } from "node:net";

/**
 * CIDR allow-lists for the operations endpoints (`/api/metrics`), the same rules as getproperty-api's
 * `src/common/http/cidr.ts` (D-230). Server-only: `node:net` never reaches a browser bundle.
 */

/** Default `METRICS_ALLOWED_CIDRS`: loopback and the private ranges (the platform's docker network, where Alloy is). */
export const PRIVATE_RANGES = "127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,::1/128,fc00::/7";

/** Parses `10.0.0.0/8, 203.0.113.7, 2001:db8::/32` into a matcher. Throws on an invalid entry. */
export function parseCidrList(value: string | undefined): BlockList {
  const list = new BlockList();
  for (const raw of (value ?? "").split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    const [address = "", prefix, extra] = entry.split("/");
    const family = isIP(address);
    if (family === 0 || extra !== undefined) throw new Error(`invalid IP in CIDR list: ${entry}`);
    const type = family === 6 ? "ipv6" : "ipv4";
    if (prefix === undefined) {
      list.addAddress(address, type);
      continue;
    }
    const bits = Number(prefix);
    const max = family === 6 ? 128 : 32;
    if (!/^\d+$/.test(prefix) || bits > max) throw new Error(`invalid prefix in CIDR list: ${entry}`);
    list.addSubnet(address, bits, type);
  }
  return list;
}

/** True when `ip` (IPv4, IPv6 or IPv4-mapped IPv6) is inside the list. */
export function ipAllowed(list: BlockList, ip: string | undefined): boolean {
  if (!ip) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped?.[1]) return list.check(mapped[1], "ipv4");
  const family = isIP(ip);
  if (family === 0) return false;
  return list.check(ip, family === 6 ? "ipv6" : "ipv4");
}

/**
 * Whether an operations request comes from inside the allow-list. Next's server fills `X-Forwarded-For` with the
 * socket's peer address only when the request has none, so:
 *
 * - Alloy scraping the container on the docker network sends no `X-Forwarded-For` → the header is its own address;
 * - anything through Caddy carries the address Caddy wrote (the internet client's) → refused.
 *
 * Every entry must be inside the list — one outside address anywhere in the chain refuses the request.
 */
export function forwardedChainAllowed(list: BlockList, headers: Headers): boolean {
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length > 0 && entries.every((entry) => ipAllowed(list, entry));
}
