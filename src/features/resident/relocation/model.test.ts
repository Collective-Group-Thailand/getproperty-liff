import { describe, expect, it } from "vitest";

import {
  consentLanguage,
  destinationBody,
  destinationFieldOf,
  destinationLabel,
  destinationProblems,
  draftFrom,
  englishForOthers,
  enquiryBody,
  matchAreas,
  purposeState,
  relocationPurpose,
  sortOffers,
  type PublicArea,
  type RelocationOffer,
} from "./model";

const area = (slug: string, name: string, nameEn: string): PublicArea =>
  ({ slug, name, nameEn, kind: "district", line: null }) as PublicArea;
const AREAS = [area("ari", "อารีย์", "Ari"), area("chatuchak", "จตุจักร", "Chatuchak")];

const offer = (over: Partial<RelocationOffer>): RelocationOffer =>
  ({
    id: "o1",
    state: "open",
    destination: null,
    createdAt: "2026-10-01T10:00:00+07:00",
    ...over,
  }) as RelocationOffer;

describe("relocation model (GL4, D-299)", () => {
  it("asks for the consent text in Thai for Thai readers and in English for everyone else", () => {
    expect(consentLanguage("th")).toBe("th");
    expect(["en", "my", "km", "lo", "zh"].map((l) => consentLanguage(l as "en"))).toEqual([
      "en",
      "en",
      "en",
      "en",
      "en",
    ]);
    expect(englishForOthers("en")).toBe(false);
    expect(englishForOthers("lo")).toBe(true);
  });

  it("reads the purpose state: on only at the current version, never assumed", () => {
    const purposes = [{ key: "resident.service" }, { key: "resident.relocation" }] as never[];
    expect(relocationPurpose(purposes)).toEqual({ key: "resident.relocation" });
    expect(relocationPurpose([])).toBeNull();
    expect(purposeState({ granted: null, grantedVersion: null, version: 1 })).toBe("off");
    expect(purposeState({ granted: true, grantedVersion: 1, version: 1 })).toBe("on");
    expect(purposeState({ granted: null, grantedVersion: 1, version: 2 })).toBe("outdated");
    expect(purposeState({ granted: false, grantedVersion: 1, version: 1 })).toBe("off");
  });

  it("puts open offers first, newest first", () => {
    const sorted = sortOffers([
      offer({ id: "closed", state: "dismissed", createdAt: "2026-10-03T00:00:00+07:00" }),
      offer({ id: "old", createdAt: "2026-09-01T00:00:00+07:00" }),
      offer({ id: "new", createdAt: "2026-10-02T00:00:00+07:00" }),
    ]);
    expect(sorted.map((o) => o.id)).toEqual(["new", "old", "closed"]);
  });

  it("builds the destination: an area or a province, never both; money as typed (no arithmetic)", () => {
    const empty = draftFrom(offer({}));
    expect(empty).toEqual({ mode: "area", areaSlug: "", province: "", district: "", maxRent: "" });
    expect(destinationProblems(empty)).toEqual(["areaSlug"]);
    expect(destinationProblems({ ...empty, mode: "place" })).toEqual(["province"]);
    expect(destinationProblems({ ...empty, areaSlug: "ari", maxRent: "12k" })).toEqual(["maxRent"]);
    expect(destinationBody({ ...empty, areaSlug: "ari", province: "x", maxRent: "12,000" })).toEqual({
      areaSlug: "ari",
      province: null,
      district: null,
      maxRent: "12000",
    });
    expect(destinationBody({ ...empty, mode: "place", province: " เชียงใหม่ ", district: "" })).toEqual({
      areaSlug: null,
      province: "เชียงใหม่",
      district: null,
      maxRent: null,
    });
    const saved = draftFrom(
      offer({ destination: { areaSlug: null, province: "เชียงใหม่", district: null, maxRent: "9000.00" } }),
    );
    expect(saved).toMatchObject({ mode: "place", province: "เชียงใหม่", maxRent: "9000" });
    expect(destinationFieldOf("maxRent")).toBe("maxRent");
    expect(destinationFieldOf("other")).toBeNull();
  });

  it("names the destination and finds areas in Thai or English", () => {
    const where = { areaSlug: "ari", province: null, district: null, maxRent: null };
    expect(destinationLabel(where, AREAS, "th")).toBe("อารีย์");
    expect(destinationLabel(where, AREAS, "zh")).toBe("Ari");
    expect(destinationLabel(where, null, "en")).toBe("ari");
    expect(destinationLabel({ ...where, areaSlug: null, province: "เชียงใหม่", district: "เมือง" }, AREAS, "th")).toBe(
      "เมือง, เชียงใหม่",
    );
    expect(matchAreas(AREAS, "chat", "").map((a) => a.slug)).toEqual(["chatuchak"]);
    expect(matchAreas(AREAS, "อารี", "ari")).toEqual([]);
    expect(matchAreas(AREAS, " ", "")).toEqual([]);
  });

  it("sends the rent record only when ticked now", () => {
    const draft = { message: "  สนใจค่ะ ", moveInDate: "", shareRentRecord: false, consent: true };
    expect(enquiryBody("slug", draft)).toEqual({
      listingSlug: "slug",
      message: "สนใจค่ะ",
      moveInDate: null,
      shareRentRecord: false,
      consent: true,
    });
    expect(enquiryBody("slug", { ...draft, shareRentRecord: true, moveInDate: "2026-12-01" })).toMatchObject({
      shareRentRecord: true,
      moveInDate: "2026-12-01",
    });
  });
});
