"use client";

import { problemFromResponse, type ApiError } from "@/lib/api/problem";

/**
 * Browser half of the sign-in (ADR-0006). The LINE id token goes from the SDK straight into this one request
 * body and nowhere else: not state, not storage, not logs. The BFF answers with the subject only and sets the
 * httpOnly session cookies.
 */
export type Audience = "resident" | "technician";

export type ExchangeResult = { ok: true } | { ok: false; error: ApiError };

const EXCHANGE_PATH: Record<Audience, string> = {
  resident: "/bff/auth/line",
  technician: "/bff/auth/technician/line",
};

export async function exchangeLineIdToken(idToken: string, audience: Audience): Promise<ExchangeResult> {
  const response = await fetch(EXCHANGE_PATH[audience], {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-getproperty-csrf": "1",
      "accept-language": document.documentElement.lang || "th",
    },
    body: JSON.stringify({ idToken }),
  });
  if (response.ok) {
    await response.body?.cancel();
    return { ok: true };
  }
  return { ok: false, error: await problemFromResponse(response) };
}

/** Ends every session this browser holds (resident and technician) and forgets the chosen unit. */
export async function signOut(): Promise<void> {
  await fetch("/bff/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: { "x-getproperty-csrf": "1" },
  });
  document.cookie = "gp_unit=; path=/; max-age=0; samesite=lax";
}
