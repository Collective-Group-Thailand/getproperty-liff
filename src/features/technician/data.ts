import "server-only";

import type { Loaded } from "@/features/resident/lease/data";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";

import type { WorkOrder } from "./model";

/** `GET /v1/technician/work-orders` — assigned to me and not yet verified, by visit time (D-210). */
export async function loadWorkOrders(): Promise<Loaded<WorkOrder[]>> {
  const api = await serverApi("technician");
  const { data, error, response } = await api.GET("/v1/technician/work-orders");
  return data ? { data: data.data } : { error: problemFromParsed(response, error) };
}

/**
 * `GET /v1/technician/work-orders/{id}` — 404 when not mine. Carries the photo links (the request's report photos
 * and this work order's before / after, 5 minutes), the resident's preferred visit and, once given, their rating
 * (D-218).
 */
export async function loadWorkOrder(workOrderId: string): Promise<Loaded<WorkOrder>> {
  const api = await serverApi("technician");
  const { data, error, response } = await api.GET("/v1/technician/work-orders/{workOrderId}", {
    params: { path: { workOrderId } },
  });
  return data ? { data } : { error: problemFromParsed(response, error) };
}
