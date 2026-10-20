import { describe, expect, it } from "vitest";

import { BANK_APPS, bankAppsFor } from "./bankApps";

describe("bankAppsFor (D-209 bankCode)", () => {
  it("puts the landlord's bank first and keeps every other bank", () => {
    const ordered = bankAppsFor("014");
    expect(ordered[0]!.id).toBe("scb");
    expect(ordered).toHaveLength(BANK_APPS.length);
    expect(new Set(ordered.map((b) => b.id))).toEqual(new Set(BANK_APPS.map((b) => b.id)));
  });
  it("keeps the usual order for an unknown or missing code", () => {
    expect(bankAppsFor("999")).toEqual(BANK_APPS);
    expect(bankAppsFor(null)).toEqual(BANK_APPS);
  });
});
