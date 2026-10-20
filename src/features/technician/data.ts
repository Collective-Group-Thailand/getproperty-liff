import "server-only";

import type { Loaded } from "@/features/resident/lease/data";
import type { WorkOrderView } from "@/lib/api/contract-requests";
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
 * `GET /v1/technician/work-orders/{id}` — 404 when not mine. CONTRACT-REQUEST #25: photo links and the resident's
 * rating are read when the API sends them (`WorkOrderView`).
 */
export async function loadWorkOrder(workOrderId: string): Promise<Loaded<WorkOrderView>> {
  const api = await serverApi("technician");
  const { data, error, response } = await api.GET("/v1/technician/work-orders/{workOrderId}", {
    params: { path: { workOrderId } },
  });
  return data ? { data: data as WorkOrderView } : { error: problemFromParsed(response, error) };
}
