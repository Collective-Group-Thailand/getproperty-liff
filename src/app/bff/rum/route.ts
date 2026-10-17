import { rumSchema } from "@/lib/observability/rumSchema";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 2048;

/**
 * Web Vitals from the browser (`navigator.sendBeacon`, which cannot add the CSRF header): same-origin only,
 * small, schema-checked, then one structured log line (`type: "rum"`) for the log pipeline. Never stores cookies,
 * IPs or anything personal; answers 204 whatever happens so a beacon never retries.
 */
export async function POST(request: Request): Promise<Response> {
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const sameOrigin = site ? site === "same-origin" : !!origin && !!host && new URL(origin).host === host;
  if (!sameOrigin) return new Response(null, { status: 403 });

  const text = await request.text();
  if (text.length > MAX_BYTES) return new Response(null, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 204 });
  }
  const parsed = rumSchema.safeParse(body);
  if (parsed.success) console.info(JSON.stringify({ type: "rum", ...parsed.data }));
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}
