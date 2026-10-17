/**
 * The in-process mock API (ADR-0005): `upstreamFetch` hands server-side API requests here when the app is a mock
 * build (`NEXT_PUBLIC_LIFF_MOCK=1`) running with `API_MOCKS=1`. MSW's `getResponse` resolves the request against
 * the handlers — no service worker, no patched global `fetch`, nothing in the browser bundle.
 *
 * `x-gp-mock` (from the `gp_mock` cookie, set by e2e tests) forces documented problems for the error paths:
 * `resident.me.get=internal.unexpected;auth.residentLine.exchange=auth.account_disabled`.
 */
import { getResponse } from "msw";

import { findOperation, problem, problemResponse } from "./contract";
import { billingHandlers } from "./billing";
import { contractRequestHandlers } from "./contract-requests";
import { contractHandlers, exampleHandlers } from "./handlers";
import { residentHandlers } from "./resident";

const handlers = [
  ...billingHandlers,
  ...contractRequestHandlers,
  ...residentHandlers,
  ...contractHandlers,
  ...exampleHandlers,
];

export const MOCK_HEADER = "x-gp-mock";

function forcedProblems(header: string | null): Map<string, string> {
  const forced = new Map<string, string>();
  for (const pair of (header ?? "").split(";")) {
    const [operationId, code] = pair.split("=").map((s) => s.trim());
    if (operationId && code) forced.set(operationId, code);
  }
  return forced;
}

export async function handleMockRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const forced = forcedProblems(request.headers.get(MOCK_HEADER));
  if (forced.size > 0) {
    const op = findOperation(request.method, url.pathname);
    const code = op ? forced.get(op.operationId) : undefined;
    if (op && code) return problem(op.operationId, code);
  }
  const response = await getResponse(handlers, request);
  if (response) return response;
  return problemResponse(404, {
    type: "https://errors.getproperty.co/http.not_found",
    title: "Not Found",
    status: 404,
    code: "http.not_found",
    detail: `No mock for ${request.method} ${url.pathname} (not in the contract or contract-requests)`,
  });
}
