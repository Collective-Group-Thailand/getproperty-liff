import "server-only";

import { getLocale } from "next-intl/server";

import { isLocale, type Locale } from "@/i18n/routing";
import type { LeaseView } from "@/lib/api/contract-requests";
import { problemFromParsed, type ApiError } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";

export type Loaded<T> = { data: T; error?: undefined } | { data?: undefined; error: ApiError };

export async function pageLocale(): Promise<Locale> {
  const current = await getLocale();
  return isLocale(current) ? current : "th";
}

/** `GET /v1/resident/leases` — my leases in every tenant (drafts and cancelled ones never come back, D-061). */
export async function loadLeases(): Promise<Loaded<LeaseView[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/leases");
  return data ? { data } : { error: problemFromParsed(response, error) };
}

/**
 * `GET /v1/resident/leases/{leaseId}` — 404 outside my `lease:` scopes (contract §8). The CONTRACT-REQUEST #7/#8
 * fields (`noticeEarliestDate`, `rulesAcknowledgedAt`) are read when the API sends them.
 */
export async function loadLease(leaseId: string): Promise<Loaded<LeaseView>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/leases/{leaseId}", {
    params: { path: { leaseId } },
  });
  return data ? { data } : { error: problemFromParsed(response, error) };
}
