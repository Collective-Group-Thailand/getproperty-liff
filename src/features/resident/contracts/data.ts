import "server-only";

import type { Loaded } from "@/features/resident/lease/data";
import { problemFromParsed } from "@/lib/api/problem";
import { serverApi } from "@/lib/api/server";
import type { RenewalOffer, ResidentContract } from "@/lib/api/types";

/**
 * `GET /v1/resident/contracts` — documents of the contract library waiting for my signature or signed by me, in every
 * tenant; drafts and cancelled ones never come back (D-294).
 */
export async function loadContracts(): Promise<Loaded<ResidentContract[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/contracts");
  return data ? { data: data.data } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/contracts/{contractId}` — 404 unless I am one of its signers (D-294). */
export async function loadContract(contractId: string): Promise<Loaded<ResidentContract>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/contracts/{contractId}", {
    params: { path: { contractId } },
  });
  return data ? { data } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/renewal-offers` — offers to renew my leases, open and decided (D-294). */
export async function loadRenewalOffers(): Promise<Loaded<RenewalOffer[]>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/renewal-offers");
  return data ? { data: data.data } : { error: problemFromParsed(response, error) };
}

/** `GET /v1/resident/renewal-offers/{offerId}` — an offer on a lease of mine (404 otherwise, contract §8). */
export async function loadRenewalOffer(offerId: string): Promise<Loaded<RenewalOffer>> {
  const api = await serverApi();
  const { data, error, response } = await api.GET("/v1/resident/renewal-offers/{offerId}", {
    params: { path: { offerId } },
  });
  return data ? { data } : { error: problemFromParsed(response, error) };
}
