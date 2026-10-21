"use client";

import { isNetworkFailure, networkError, problemFromResponse } from "@/lib/api/problem";

/**
 * Sign-out (ADR-0006), apart from `client.ts` so the shell loads it only when the resident signs out (the settings
 * menu imports it on demand — D-179 budget); the profile's button imports it directly.
 */

/** Fired on `window` once this browser signs out: long-lived connections (the realtime stream) close on it. */
export const SIGNED_OUT_EVENT = "gp:signed-out";

/**
 * Ends every session this browser holds (resident and technician) and forgets the chosen unit. Throws an `ApiError`
 * when the BFF could not be reached (the cookies are then still set — the screen says so and lets the resident retry,
 * review M1); the realtime stream is closed either way.
 */
export async function signOut(): Promise<void> {
  window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
  let response: Response;
  try {
    response = await fetch("/bff/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "x-getproperty-csrf": "1" },
    });
  } catch (caught) {
    throw isNetworkFailure(caught) ? networkError() : caught;
  }
  if (!response.ok) throw await problemFromResponse(response);
  document.cookie = "gp_unit=; path=/; max-age=0; samesite=lax";
}
