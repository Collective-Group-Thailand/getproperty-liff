import { serverEnv } from "@/lib/env";
import { forwardedChainAllowed, parseCidrList, PRIVATE_RANGES } from "@/lib/http/cidr";
import { processMetrics } from "@/lib/observability/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Prometheus text for Grafana Alloy (D-230: the container label `collective.metrics.path: /api/metrics`). Only callers
 * inside `METRICS_ALLOWED_CIDRS` (default loopback + private ranges, i.e. the docker network) get an answer; anything
 * else — including every request through Caddy, which carries the internet client's address — gets the same 404 as
 * an unknown path. Caddy also answers `/api/metrics` with 404 on the public host.
 */
export async function GET(request: Request): Promise<Response> {
  const env = serverEnv();
  const allowed = parseCidrList(env.METRICS_ALLOWED_CIDRS || PRIVATE_RANGES);
  if (!forwardedChainAllowed(allowed, request.headers)) {
    return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });
  }
  const registry = processMetrics(env.OTEL_SERVICE_NAME);
  return new Response(await registry.metrics(), {
    headers: { "content-type": registry.contentType, "cache-control": "no-store" },
  });
}
