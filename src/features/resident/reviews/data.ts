import "server-only";

import type { Loaded } from "@/features/resident/lease/data";
import { consentLanguage } from "@/features/resident/relocation/model";
import type { Locale } from "@/i18n/routing";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";

import type { ResidentReview } from "./model";

/**
 * `GET /v1/resident/leases/{leaseId}/review` — eligibility, my review and the `review.publish` text. The text exists in
 * Thai and English only (O-035 (d)): asked in Thai for Thai readers, in English for everyone else.
 */
export async function loadReview(leaseId: string, locale: Locale): Promise<Loaded<ResidentReview>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/leases/{leaseId}/review", {
    params: { path: { leaseId } },
    headers: { "accept-language": consentLanguage(locale) },
  });
  return data ? { data } : { error: problemFromParsed(response, error) };
}
