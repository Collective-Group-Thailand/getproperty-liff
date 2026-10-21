/**
 * What this app may believe about a request from its own edge (review H2, L4). Framework-free: the BFF, the proxy and
 * the rescope route share it.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+(:(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})?$/i;

/**
 * The request id for logs and the API: the inbound `x-request-id` only when it is a UUID (our edge or this app made
 * it), else a new one — a client must not choose the correlation id or inject text into log fields (review L4).
 */
export function requestIdFrom(headers: Headers): string {
  const inbound = headers.get("x-request-id")?.trim();
  return inbound && UUID.test(inbound) ? inbound.toLowerCase() : crypto.randomUUID();
}

function isIpAddress(value: string): boolean {
  return IPV4.test(value) || (value.includes(":") && IPV6.test(value) && value.length <= 45);
}

/**
 * The end user's address as **our** edge saw it (review H2): load balancers and Cloud Run's front end *append* the
 * address they received the request from to `X-Forwarded-For`, so everything left of the entries they added is
 * whatever the client sent. With `trustedHops` proxies in front of this app, the client is the entry `trustedHops`
 * from the right. 0 (no trusted proxy, local dev) or a header with fewer entries → unknown: nothing is forwarded.
 * `X-Real-IP` is never read (any client can send it).
 */
export function clientIpFrom(headers: Headers, trustedHops: number): string | undefined {
  if (!Number.isInteger(trustedHops) || trustedHops <= 0) return undefined;
  const entries = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const candidate = entries[entries.length - trustedHops];
  return candidate && isIpAddress(candidate) ? candidate : undefined;
}
