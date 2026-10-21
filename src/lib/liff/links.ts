import { LIFF_STATE_PARAM, safeInternalPath } from "./deepLink";

/**
 * "Open in LINE" (D-060): `https://liff.line.me/<liffId>/<path>` opens this app inside LINE when LINE is
 * installed (LINE Login on the web otherwise) and lands on `/liff?liff.state=/<path>`. Without a real LIFF id
 * (mock builds, local work) it is this app's own LIFF endpoint, which the fake LIFF serves.
 *
 * The id is a run-time value (D-230): server pages pass `serverEnv().NEXT_PUBLIC_LIFF_ID`, browser code `liffId()`.
 */
export function liffUrl(next: string, id: string | undefined): string {
  const target = safeInternalPath(next);
  const real = process.env.NEXT_PUBLIC_LIFF_MOCK === "1" ? undefined : id;
  if (real) return `https://liff.line.me/${real}${target === "/" ? "" : target}`;
  return `/liff?${LIFF_STATE_PARAM}=${encodeURIComponent(target)}`;
}
