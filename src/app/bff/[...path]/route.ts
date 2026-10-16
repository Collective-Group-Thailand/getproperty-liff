import { NextResponse } from "next/server";

/**
 * The resident BFF — **not implemented in L0** (src/lib/bff/README.md). L1 replaces this with
 * `createBffHandler()`: allow-list `/v1/resident/*`, `/v1/technician/*` (R2) and `/v1/auth/resident/*`,
 * bearer from the httpOnly cookie, one refresh on 401, same-origin + `x-getproperty-csrf: 1` on non-GET.
 * Until then every method answers `501` as an RFC 9457 problem so nothing mistakes it for an API.
 */
function notImplemented() {
  return NextResponse.json(
    {
      type: "about:blank",
      title: "Not Implemented",
      status: 501,
      code: "bff.not_implemented",
      detail: "The resident BFF arrives in L1 (docs/prompts/L1-foundation.md).",
    },
    { status: 501, headers: { "content-type": "application/problem+json", "cache-control": "no-store" } },
  );
}

export const GET = notImplemented;
export const POST = notImplemented;
export const PUT = notImplemented;
export const PATCH = notImplemented;
export const DELETE = notImplemented;
