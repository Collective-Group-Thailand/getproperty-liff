import "server-only";

import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import type {
  Incident,
  OpenableGate,
  PageMeta,
  RememberedVehicle,
  ResidentGate,
  ResidentVehicle,
  ResidentVisit,
  Visit,
  VisitInvite,
  VisitState,
} from "@/lib/api/types";

import type { Loaded } from "../lease/data";

/** The request's clock (server components read the time here, like `bangkokToday`). */
export function requestTime(): number {
  return Date.now();
}

/**
 * JL4 — the gate, read on the server (D-315 … D-317, D-327, D-328). Residents read only units they hold a gate role
 * on; anything else is the API's 404, which these loaders turn into `null` (the page then says "not found").
 */

export async function loadVisit(visitId: string): Promise<Loaded<ResidentVisit | null>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/visits/{visitId}", {
    params: { path: { visitId } },
  });
  if (data) return { data };
  if (response.status === 404) return { data: null };
  return { error: problemFromParsed(response, error) };
}

export async function loadVisits(
  unitId: string,
  options: { page?: number; perPage?: number; state?: VisitState } = {},
): Promise<Loaded<{ items: Visit[]; meta: PageMeta }>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/visits", {
    params: {
      query: { unitId, page: options.page ?? 1, perPage: options.perPage ?? 25, state: options.state, order: "desc" },
    },
  });
  return data ? { data: { items: data.data, meta: data.meta } } : { error: problemFromParsed(response, error) };
}

/** The house policy, the estate's gates, the privacy notice and my edit right; `null` when the unit has no gate. */
export async function loadGate(unitId: string): Promise<Loaded<ResidentGate | null>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/units/{unitId}/gate", {
    params: { path: { unitId } },
  });
  if (data) return { data };
  if (response.status === 404) return { data: null };
  return { error: problemFromParsed(response, error) };
}

export async function loadInvites(unitId: string): Promise<Loaded<VisitInvite[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/units/{unitId}/visit-invites", {
    params: { path: { unitId } },
  });
  return data ? { data } : { error: problemFromParsed(response, error) };
}

export async function loadRemembered(unitId: string): Promise<Loaded<RememberedVehicle[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/units/{unitId}/remembered-vehicles", {
    params: { path: { unitId } },
  });
  return data ? { data } : { error: problemFromParsed(response, error) };
}

export async function loadCars(unitId: string): Promise<Loaded<ResidentVehicle[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/units/{unitId}/vehicles", {
    params: { path: { unitId } },
  });
  return data ? { data } : { error: problemFromParsed(response, error) };
}

/** Gates with a barrier I may open with a car of my units, for the estate of the unit on screen. */
export async function loadOpenableGates(propertyId: string): Promise<Loaded<OpenableGate[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/gates");
  return data
    ? { data: data.filter((g) => !propertyId || g.propertyId === propertyId) }
    : { error: problemFromParsed(response, error) };
}

export async function loadIncident(incidentId: string): Promise<Loaded<Incident | null>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/sos/{incidentId}", {
    params: { path: { incidentId } },
  });
  if (data) return { data };
  if (response.status === 404) return { data: null };
  return { error: problemFromParsed(response, error) };
}

export async function loadIncidents(unitId: string): Promise<Loaded<Incident[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/sos", { params: { query: { unitId } } });
  return data ? { data } : { error: problemFromParsed(response, error) };
}
