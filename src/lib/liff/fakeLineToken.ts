/**
 * The id token the fake LIFF hands out — the format getproperty-api's fake LINE verifier accepts
 * (`src/integrations/line/fake-line-login.ts` there): `fake-line.<base64url(claims)>`. So the same fake LIFF
 * drives the mock API (e2e) and a real API running with `INTEGRATIONS_MODE=fake` (integration project).
 * Never accepted by a real LINE verifier.
 */
export const FAKE_LINE_PREFIX = "fake-line.";

export interface FakeLineClaims {
  sub: string;
  name?: string;
  aud?: string;
  /** Seconds since the epoch. */
  exp?: number;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function fakeLineIdToken(claims: FakeLineClaims, now: number = Date.now()): string {
  const full = { aud: "fake-channel", exp: Math.floor(now / 1000) + 600, name: "LINE Test", ...claims };
  return FAKE_LINE_PREFIX + toBase64Url(JSON.stringify(full));
}

export function readFakeLineIdToken(token: string, now: number = Date.now()): Required<FakeLineClaims> | null {
  if (!token.startsWith(FAKE_LINE_PREFIX)) return null;
  try {
    const claims = JSON.parse(fromBase64Url(token.slice(FAKE_LINE_PREFIX.length))) as Required<FakeLineClaims>;
    if (typeof claims.sub !== "string" || typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null;
    return claims;
  } catch {
    return null;
  }
}
