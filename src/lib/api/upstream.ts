import { serverEnv } from "@/lib/env";

/**
 * The one way server code reaches getproperty-api (BFF, `serverApi()`, the proxy's refresh).
 *
 * In a mock build (`NEXT_PUBLIC_LIFF_MOCK=1`, inlined at build time) with `API_MOCKS=1`, requests are answered
 * in-process by the contract-based MSW handlers in `mocks/` — no network, no global fetch patching. The
 * condition is written inline so a production build drops the branch and never contains the mocks.
 */
export const MOCK_API_ORIGIN = "http://mock-api.invalid";

/** The header the mock handlers read their scenario from (mock builds only, from the `gp_mock` cookie). */
export const MOCK_SCENARIO_HEADER = "x-gp-mock";
export const MOCK_SCENARIO_COOKIE = "gp_mock";

export function apiBaseUrl(): string {
  const env = serverEnv();
  if (process.env.NEXT_PUBLIC_LIFF_MOCK === "1" && env.API_MOCKS) return MOCK_API_ORIGIN;
  if (!env.API_INTERNAL_URL) throw new Error("API_INTERNAL_URL is not set (or set API_MOCKS=1 in a mock build)");
  return env.API_INTERNAL_URL.replace(/\/$/, "");
}

export async function upstreamFetch(request: Request): Promise<Response> {
  if (process.env.NEXT_PUBLIC_LIFF_MOCK === "1" && serverEnv().API_MOCKS) {
    const { handleMockRequest } = await import("../../../mocks/server");
    return handleMockRequest(request);
  }
  return fetch(request, { cache: "no-store", redirect: "manual" });
}
