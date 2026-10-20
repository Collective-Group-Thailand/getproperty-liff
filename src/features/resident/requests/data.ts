import "server-only";

import type { ServiceRequestView } from "@/lib/api/contract-requests";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import type { PageMeta } from "@/lib/api/types";

import type { Loaded } from "../lease/data";
import type { ServiceCategory, ServiceRequest } from "./model";

export const REQUESTS_PAGE_SIZE = 25;

/** `GET /v1/resident/service-requests` — the requests of my units and the ones I reported, newest first. */
export async function loadRequests(page: number): Promise<Loaded<{ items: ServiceRequest[]; meta: PageMeta }>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/service-requests", {
    params: { query: { page, perPage: REQUESTS_PAGE_SIZE } },
  });
  return data ? { data: { items: data.data, meta: data.meta } } : { error: problemFromParsed(response, error) };
}

/**
 * `GET /v1/resident/service-requests/{id}` — 404 when it is neither of my unit nor reported by me. CONTRACT-REQUEST
 * #22 / #24: photo links, the status history, the SLA state and the visit confirmation are read when the API sends
 * them (`ServiceRequestView`); the page works on the contract's fields alone.
 */
export async function loadRequest(serviceRequestId: string): Promise<Loaded<ServiceRequestView>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/service-requests/{serviceRequestId}", {
    params: { path: { serviceRequestId } },
  });
  return data ? { data: data as ServiceRequestView } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/service-categories?unitId=` — the landlord's categories of that unit, active ones in order. */
export async function loadCategories(unitId: string): Promise<Loaded<ServiceCategory[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/service-categories", {
    params: { query: { unitId } },
  });
  if (!data) return { error: problemFromParsed(response, error) };
  return { data: data.data.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder) };
}
