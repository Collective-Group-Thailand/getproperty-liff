import "server-only";

import { problemFromParsed, type ApiError } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";

import type { HistoryItem, PublicArea, Recommendations, RecommendationsAudience } from "./model";

type Loaded<T> = { data: T; error?: never } | { data?: never; error: ApiError };

/** `GET /v1/{resident|prospect}/me/recommendations` — my consent (text in my language), preferences and limits. */
export async function loadRecommendations(audience: RecommendationsAudience): Promise<Loaded<Recommendations>> {
  const api = await serverApi(audience);
  const { data, error, response } =
    audience === "resident"
      ? await api.GET("/v1/resident/me/recommendations")
      : await api.GET("/v1/prospect/me/recommendations");
  return data ? { data } : { error: problemFromParsed(response, error) };
}

/** One page of what was sent to me, newest first. */
export async function loadHistory(
  audience: RecommendationsAudience,
  page: number,
  perPage: number,
): Promise<Loaded<{ items: HistoryItem[]; meta: { page: number; perPage: number; total: number } }>> {
  const api = await serverApi(audience);
  const query = { params: { query: { page, perPage } } };
  const { data, error, response } =
    audience === "resident"
      ? await api.GET("/v1/resident/me/recommendations/history", query)
      : await api.GET("/v1/prospect/me/recommendations/history", query);
  return data ? { data: { items: data.data, meta: data.meta } } : { error: problemFromParsed(response, error) };
}

/** The public areas and stations (`GET /v1/public/listings/areas`) — the only slugs the API accepts. */
export async function loadAreas(): Promise<PublicArea[] | null> {
  const api = await serverApi("prospect");
  const { data } = await api.GET("/v1/public/listings/areas");
  return data?.data ?? null;
}
