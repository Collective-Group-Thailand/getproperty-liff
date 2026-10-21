export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Liveness for the platform (D-230: the compose healthcheck `wget http://127.0.0.1:3000/api/healthz`, and
 * `deploy-product.sh`'s health gate). It answers when this Next server serves requests — deliberately **not** whether
 * getproperty-api is up: the API has its own `/health`, and an API outage must not make the platform restart or roll
 * back this container. Server-only; no session, no cookies, never cached.
 */
export function GET(): Response {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}

export function HEAD(): Response {
  return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
}
