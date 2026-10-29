import "server-only";

import type { Loaded } from "@/features/resident/lease/data";
import type { Locale } from "@/i18n/routing";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import type { ConsentPurpose, Schemas } from "@/lib/api/types";

import { consentLanguage, relocationPurpose, type RelocationOffers } from "./model";

/** `GET /v1/resident/relocation-offers` — mine, with listings while open and consented (D-299). */
export async function loadRelocationOffers(): Promise<Loaded<RelocationOffers>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/relocation-offers");
  return data ? { data } : { error: problemFromParsed(response, error) };
}

/**
 * The `resident.relocation` purpose with my answer, its text in Thai for Thai readers and in English for everyone else
 * (the API publishes th / en only; another language would come back in Thai). Null when the API does not list it.
 */
export async function loadRelocationPurpose(locale: Locale): Promise<Loaded<ConsentPurpose | null>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/consents", {
    headers: { "accept-language": consentLanguage(locale) },
  });
  return data ? { data: relocationPurpose(data) } : { error: problemFromParsed(response, error) };
}

/** My rent record (D-256) — what a new landlord would see if I send it; null when it cannot be read. */
export async function loadRentRecord(): Promise<Schemas["RentRecordDto"] | null> {
  const api = await serverApi();
  const { data } = await api.GET("/v1/resident/me/rent-record");
  return data?.record ?? null;
}
