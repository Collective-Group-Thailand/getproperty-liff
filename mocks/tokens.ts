/**
 * JWT-shaped mock access tokens (`<header>.<payload>.mock`): the app reads `exp`/`aud` from the payload exactly
 * as it does for the API's EdDSA tokens (`readAccessClaims`), so the proxy's and the BFF's refresh logic run
 * unchanged against the mocks. The signature is not a signature; only the mock API accepts these.
 */
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

export interface MockClaims {
  sub: string;
  aud: "resident" | "technician" | "prospect";
  sid: string;
  exp: number;
  iat: number;
}

export function mockAccessToken(
  claims: Omit<MockClaims, "exp" | "iat">,
  now = Date.now(),
): { token: string; exp: number } {
  const iat = Math.floor(now / 1000);
  const exp = iat + ACCESS_TTL_SECONDS;
  return { token: `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ ...claims, iat, exp })}.mock`, exp };
}

export function readMockAccessToken(token: string, now = Date.now()): MockClaims | null {
  const [, payload, signature] = token.split(".");
  if (!payload || signature !== "mock") return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as MockClaims;
    return claims.exp * 1000 > now ? claims : null;
  } catch {
    return null;
  }
}

/** ISO 8601 with the Bangkok offset, like the API. */
export function bangkokIso(epochMs: number): string {
  const local = new Date(epochMs + 7 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, "");
  return `${local}+07:00`;
}

export const TTL = { access: ACCESS_TTL_SECONDS, refresh: REFRESH_TTL_SECONDS };
