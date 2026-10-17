import { LIFF_STATE_PARAM, safeInternalPath } from "./deepLink";

/**
 * "Open in LINE" (D-060): `https://liff.line.me/<liffId>/<path>` opens this app inside LINE when LINE is
 * installed (LINE Login on the web otherwise) and lands on `/liff?liff.state=/<path>`. Without a real LIFF id
 * (mock builds, local work) it is this app's own LIFF endpoint, which the fake LIFF serves.
 */
export function liffUrl(next: string): string {
  const target = safeInternalPath(next);
  const id = process.env.NEXT_PUBLIC_LIFF_MOCK === "1" ? undefined : process.env.NEXT_PUBLIC_LIFF_ID;
  if (id) return `https://liff.line.me/${id}${target === "/" ? "" : target}`;
  return `/liff?${LIFF_STATE_PARAM}=${encodeURIComponent(target)}`;
}

/** The building's LINE Official Account chat, when one is configured. */
export function lineOaUrl(): string | undefined {
  const oa = process.env.NEXT_PUBLIC_LINE_OA_ID;
  return oa ? `https://line.me/R/ti/p/${encodeURIComponent(oa)}` : undefined;
}
