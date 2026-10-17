import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActor } from "./actor";
import { consentPath, PATHNAME_HEADER, signInPath } from "./redirects";

/** The path of this request, as the proxy recorded it (layouts cannot read the URL). */
export async function currentPath(): Promise<string> {
  return (await headers()).get(PATHNAME_HEADER) ?? "/";
}

/**
 * Guards for the resident area (L1 1.2 §5). Signed out → the sign-in for this browser (LIFF inside LINE, the
 * sign-in page elsewhere) with the current path as `next`; missing required consents → the consent screen
 * (D-025). Errors other than 401 are returned for the page to show — never treated as "signed out".
 */
export async function requireResident(options: { consent?: boolean; path?: string } = {}) {
  const actor = await getActor();
  const path = options.path ?? (await currentPath());
  if (actor.status === "anonymous") redirect(signInPath(path, (await headers()).get("user-agent")));
  if (actor.status === "signed-in" && options.consent !== false && !actor.me.consentComplete)
    redirect(consentPath(path));
  return actor;
}
