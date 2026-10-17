import { apiBaseUrl, MOCK_SCENARIO_COOKIE, MOCK_SCENARIO_HEADER, upstreamFetch } from "@/lib/api/upstream";
import { parseCookieHeader } from "@/lib/auth/cookies";
import { createBffHandler } from "@/lib/bff/handler";
import { serverEnv } from "@/lib/env";

/** The resident BFF (`src/lib/bff/handler.ts`, ADR-0006). Never cached, always on the Node runtime. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handler = createBffHandler(() => {
  const env = serverEnv();
  return {
    apiBaseUrl: apiBaseUrl(),
    upstream: upstreamFetch,
    technicianEnabled: env.FEATURE_TECHNICIAN,
    appOrigin: env.APP_ORIGIN,
    upstreamHeaders: (request: Request): Record<string, string> => {
      // Mock builds only (inlined; dropped from production bundles): the e2e scenario travels to the MSW handlers.
      if (process.env.NEXT_PUBLIC_LIFF_MOCK !== "1") return {};
      const scenario = parseCookieHeader(request.headers.get("cookie")).get(MOCK_SCENARIO_COOKIE);
      return scenario ? { [MOCK_SCENARIO_HEADER]: scenario } : {};
    },
  };
});

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
