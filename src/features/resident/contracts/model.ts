import type { Locale } from "@/i18n/routing";
import type { ContractDisclaimer, RenewalOffer, ResidentContract } from "@/lib/api/types";

/**
 * The disclaimer as the API returns it (`contract.library.disclaimer`, D-290): the platform keeps it in Thai and
 * English only, so Thai readers get the Thai text and every other language the English one — never a translation
 * made here (it is legal wording, O-025).
 */
export function disclaimerText(disclaimer: ContractDisclaimer, locale: Locale): { text: string; lang: "th" | "en" } {
  return locale === "th" ? { text: disclaimer.th, lang: "th" } : { text: disclaimer.en, lang: "en" };
}

/** A document the API lets me sign now (`nextActions` has `sign`). */
export const awaitsMySignature = (contract: ResidentContract) => contract.nextActions.includes("sign");

/** An offer I can still answer (`nextActions` has `accept` or `decline`). */
export const isOpenOffer = (offer: RenewalOffer) =>
  offer.nextActions.includes("accept") || offer.nextActions.includes("decline");

/** Documents to sign first, then the newest. */
export function sortContracts(contracts: ResidentContract[]): ResidentContract[] {
  return [...contracts].sort(
    (a, b) =>
      Number(awaitsMySignature(b)) - Number(awaitsMySignature(a)) ||
      (b.sentAt ?? b.createdAt).localeCompare(a.sentAt ?? a.createdAt),
  );
}

/** Open offers first, then the newest. */
export function sortOffers(offers: RenewalOffer[]): RenewalOffer[] {
  return [...offers].sort(
    (a, b) => Number(isOpenOffer(b)) - Number(isOpenOffer(a)) || b.createdAt.localeCompare(a.createdAt),
  );
}
