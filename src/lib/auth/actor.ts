import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";

import { problemFromParsed, type ApiError } from "@/lib/api/problem";
import { hasSessionCookie, serverApi } from "@/lib/api/server";
import type { ProspectMe, ResidentMe, ResidentUnit, Schemas, TechnicianMe } from "@/lib/api/types";

import { UNIT_COOKIE } from "./cookies";
import { entitlementsOf, type ResidentNavEntitlements } from "./entitlements";

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
      /** The unit the header shows: the `gp_unit` choice when it is still one of mine, else the first. */
      unit: ResidentUnit | null;
      entitlements: ResidentNavEntitlements;
    };

export const getActor = cache(async (): Promise<ResidentActor> => {
  if (!(await hasSessionCookie("resident"))) return { status: "anonymous" };
  const api = await serverApi("resident");
  const { data, error, response } = await api.GET("/v1/resident/me");
  if (data) {
    const me = data as ResidentMe;
    const chosen = (await cookies()).get(UNIT_COOKIE)?.value;
    const unit = me.units.find((u) => u.unitId === chosen) ?? me.units[0] ?? null;
    return { status: "signed-in", me, unit, entitlements: entitlementsOf(me) };
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
