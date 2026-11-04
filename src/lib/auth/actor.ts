import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { problemFromParsed, type ApiError } from "@/lib/api/problem";
import { hasSessionCookie, serverApi } from "@/lib/api/server";
import { homeKindOf, myUnits, pickUnit, unitEntitlements, type HomeKind, type MyUnit } from "./units";
import type {
  ProspectMe,
  ResidentMe,
  ResidentMeUnits,
  ResidentUnitCapability,
  Schemas,
  TechnicianMe,
} from "@/lib/api/types";

import { UNIT_COOKIE } from "./cookies";
import type { ResidentNavEntitlements } from "./entitlements";

/**
 * Who is using the app, from `/v1/resident/me` (party, occupancies → units, language, consents, entitlements),
 * fetched at most once per request (`cache`). The layout guards and the i18n config read the same result.
 */
export type ResidentActor =
  | { status: "anonymous" }
  | { status: "error"; error: ApiError }
  | {
      status: "signed-in";
      me: ResidentMe;
      /** JRL: every unit I live in or own (`/me/units`), with my roles and its capabilities. */
      units: MyUnit[];
      /** The unit the header shows: the `gp_unit` choice when it is still one of mine, else the first. */
      unit: MyUnit | null;
      /** The menus of that unit: my entitlements (the tenant's modules) ∩ the unit's capabilities (D-322). */
      entitlements: ResidentNavEntitlements;
      capabilities: ReadonlySet<ResidentUnitCapability>;
      home: HomeKind;
      /** `/me/units` says my token's unit scopes are behind today's units: rotate the session (`/auth/rescope`). */
      refreshRequired: boolean;
      /** Whether the `gp_unit` cookie came with the request (the switcher restores a stored choice otherwise). */
      remembered: boolean;
    };

export const getActor = cache(async (): Promise<ResidentActor> => {
  if (!(await hasSessionCookie("resident"))) return { status: "anonymous" };
  const api = await serverApi("resident");
  const [{ data, error, response }, listed] = await Promise.all([
    api.GET("/v1/resident/me"),
    // JRL: a failure here leaves the occupancies of /me (`myUnits` fallback), never the whole app.
    api.GET("/v1/resident/me/units").catch(() => ({ data: undefined })),
  ]);
  if (data) {
    const me = data as ResidentMe;
    const list = (listed.data as ResidentMeUnits | undefined) ?? null;
    const units = myUnits(me, list?.units ?? null);
    const chosen = (await cookies()).get(UNIT_COOKIE)?.value;
    const unit = pickUnit(units, chosen);
    return {
      status: "signed-in",
      me,
      units,
      unit,
      entitlements: unitEntitlements(me.entitlements ?? [], unit),
      capabilities: new Set(unit?.capabilities ?? []),
      home: homeKindOf(unit),
      refreshRequired: list?.refreshRequired ?? false,
      remembered: chosen !== undefined,
    };
  }
  const problem = problemFromParsed(response, error);
  // A token of another audience (an operator's, from getproperty-web) never counts as a resident session.
  if (response.status === 401 || problem.code === "auth.wrong_audience") return { status: "anonymous" };
  return { status: "error", error: problem };
});

export type TechnicianActor =
  { status: "anonymous" } | { status: "error"; error: ApiError } | { status: "signed-in"; me: TechnicianMe };

export const getTechnician = cache(async (): Promise<TechnicianActor> => {
  if (!(await hasSessionCookie("technician"))) return { status: "anonymous" };
  const api = await serverApi("technician");
  const { data, error, response } = await api.GET("/v1/technician/me");
  if (data) return { status: "signed-in", me: data };
  const problem = problemFromParsed(response, error);
  if (response.status === 401 || problem.code === "auth.wrong_audience") return { status: "anonymous" };
  return { status: "error", error: problem };
});

export type ProspectActor =
  { status: "anonymous" } | { status: "error"; error: ApiError } | { status: "signed-in"; me: ProspectMe };

/** The prospect session (L5, D-281): its own cookies and audience — a resident's session never counts. */
export const getProspect = cache(async (): Promise<ProspectActor> => {
  if (!(await hasSessionCookie("prospect"))) return { status: "anonymous" };
  const api = await serverApi("prospect");
  const { data, error, response } = await api.GET("/v1/prospect/me");
  if (data) return { status: "signed-in", me: data };
  const problem = problemFromParsed(response, error);
  if (response.status === 401 || problem.code === "auth.wrong_audience") return { status: "anonymous" };
  return { status: "error", error: problem };
});

export type LandlordActor =
  | { status: "anonymous" }
  | { status: "error"; error: ApiError }
  /** Signed in, but the organisation is not a landlord's (an apartment's operators use the web console). */
  | { status: "not-landlord"; me: Schemas["OperatorMeDto"] }
  | { status: "signed-in"; me: Schemas["OperatorMeDto"] };

/**
 * The landlord's operator session (L5 5.3, D-251): `/v1/owner/me` with the session's tenant. Only a landlord tenant
 * gets the quick actions; anyone else is pointed to the web console.
 */
export const getLandlord = cache(async (): Promise<LandlordActor> => {
  if (!(await hasSessionCookie("landlord"))) return { status: "anonymous" };
  const api = await serverApi("landlord");
  const { data, error, response } = await api.GET("/v1/owner/me");
  if (data)
    return data.currentTenant?.type === "landlord"
      ? { status: "signed-in", me: data }
      : { status: "not-landlord", me: data };
  const problem = problemFromParsed(response, error);
  if (response.status === 401 || problem.code === "auth.wrong_audience") return { status: "anonymous" };
  return { status: "error", error: problem };
});
