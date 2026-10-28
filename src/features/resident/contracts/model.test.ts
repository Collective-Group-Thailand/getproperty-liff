import { describe, expect, it } from "vitest";

import type { RenewalOffer, ResidentContract } from "@/lib/api/types";

import { awaitsMySignature, disclaimerText, isOpenOffer, sortContracts, sortOffers } from "./model";

const disclaimer = { th: "ตัวอย่างสัญญา", en: "A sample contract", settingKey: "contract.library.disclaimer" };
const contract = (id: string, nextActions: string[], sentAt: string) =>
  ({ id, nextActions, sentAt, createdAt: sentAt }) as unknown as ResidentContract;
const offer = (id: string, nextActions: string[], createdAt: string) =>
  ({ id, nextActions, createdAt }) as unknown as RenewalOffer;

describe("contracts model (GL3)", () => {
  it("shows the API's disclaimer: Thai for Thai, English for every other language", () => {
    expect(disclaimerText(disclaimer, "th")).toEqual({ text: "ตัวอย่างสัญญา", lang: "th" });
    for (const locale of ["en", "my", "km", "lo", "zh"] as const) {
      expect(disclaimerText(disclaimer, locale)).toEqual({ text: "A sample contract", lang: "en" });
    }
  });

  it("follows nextActions for signing and answering", () => {
    expect(awaitsMySignature(contract("a", ["sign", "download"], "2026-10-01"))).toBe(true);
    expect(awaitsMySignature(contract("a", ["download"], "2026-10-01"))).toBe(false);
    expect(isOpenOffer(offer("o", ["decline"], "2026-10-01"))).toBe(true);
    expect(isOpenOffer(offer("o", [], "2026-10-01"))).toBe(false);
  });

  it("puts what needs me first, then the newest", () => {
    const sorted = sortContracts([
      contract("old", ["download"], "2026-09-01"),
      contract("sign", ["sign"], "2026-08-01"),
      contract("new", ["download"], "2026-10-01"),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(["sign", "new", "old"]);
    const offers = sortOffers([offer("done", [], "2026-10-01"), offer("open", ["accept"], "2026-01-01")]);
    expect(offers.map((o) => o.id)).toEqual(["open", "done"]);
  });
});
