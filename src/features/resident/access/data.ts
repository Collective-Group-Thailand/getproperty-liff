import "server-only";

import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import type { Schemas } from "@/lib/api/types";

import type { Loaded } from "../lease/data";

export type AccessEvent = Schemas["AccessEventDto"];
export const LOG_DAYS = 30;

/**
 * `GET /v1/resident/access/events?unitId=&from=` — unlocks of my unit's locks and the building-door unlocks made with
 * my own codes, never another unit's (D-025, D-070); 404 for a unit I do not occupy.
 */
export async function loadUnlockLog(unitId: string, now = Date.now()): Promise<Loaded<AccessEvent[]>> {
  const api = await serverApi();
  const from = new Date(now - LOG_DAYS * 86_400_000).toISOString();
  const { data, error, response } = await api.GET("/v1/resident/access/events", {
    params: { query: { unitId, from, limit: 200 } },
  });
  return data ? { data: data.data } : { error: problemFromParsed(response, error) };
}
