import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { getActor, getTechnician } from "./actor";
import { consentPath, PATHNAME_HEADER, signInPath, technicianSignInPath } from "./redirects";
import { RESCOPE_COOKIE, rescopePath, scopesStale } from "./rescope";

/** The path of this request, as the proxy recorded it (layouts cannot read the URL). */
export async function currentPath(): Promise<string> {
  return (await headers()).get(PATHNAME_HEADER) ?? "/";
}

/**
 * Guards for the resident area (L1 1.2 §5). Signed out → the sign-in for this browser (LIFF inside LINE, the
 * sign-in page elsewhere) with the current path as `next`; missing required consents → the consent screen
 * (D-025). Errors other than 401 are returned for the page to show — never treated as "signed out". A session whose
 * token lacks the scopes of a unit or lease `/me` already lists (a phone match the Owner confirmed, D-226) is
 * rotated once through `/auth/rescope` before the page renders.
 */
export async function requireResident(options: { consent?: boolean; path?: string } = {}) {
  const actor = await getActor();
  const path = options.path ?? (await currentPath());
  if (actor.status === "anonymous") redirect(signInPath(path, (await headers()).get("user-agent")));
  if (actor.status === "signed-in" && options.consent !== false && !actor.me.consentComplete)
    redirect(consentPath(path));
  if (actor.status === "signed-in" && scopesStale(actor.me) && !(await cookies()).has(RESCOPE_COOKIE))
    redirect(rescopePath(path));
  return actor;
}

/**
 * Guard of the technician screens (L4 4.4 §3): a technician session of their own; a resident's session does not count
 * (separate cookies and audience). Signed out → LINE sign-in inside LINE, `/technician/sign-in` elsewhere.
 */
export async function requireTechnician(options: { path?: string } = {}) {
  const actor = await getTechnician();
  const path = options.path ?? (await currentPath());
  if (actor.status === "anonymous") redirect(technicianSignInPath(path, (await headers()).get("user-agent")));
  return actor;
}
