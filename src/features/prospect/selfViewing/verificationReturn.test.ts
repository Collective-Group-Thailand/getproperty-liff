import { afterEach, describe, expect, it } from "vitest";

import { recallReturn, rememberReturn } from "./verificationReturn";

/** Review G, L5: the booking survives the e-KYC provider's round trip (the API's return page has no query). */
describe("verification return path", () => {
  afterEach(() => sessionStorage.clear());

  it("remembers a self-viewing booking and gives it back", () => {
    rememberReturn("/rent/condo-1br-a1b2c3d4e5/self-viewing", 1_000);
    expect(recallReturn(2_000)).toBe("/rent/condo-1br-a1b2c3d4e5/self-viewing");
  });

  it("never keeps or returns anything but a self-viewing path of this app", () => {
    rememberReturn("//evil.example/rent/x/self-viewing", 1_000);
    expect(recallReturn(2_000)).toBeNull();
    sessionStorage.setItem("gp.verification.return", JSON.stringify({ path: "https://evil.example", at: 1_000 }));
    expect(recallReturn(2_000)).toBeNull();
    sessionStorage.setItem("gp.verification.return", "not json");
    expect(recallReturn(2_000)).toBeNull();
  });

  it("forgets it after an hour", () => {
    rememberReturn("/rent/condo-1br-a1b2c3d4e5/self-viewing", 0);
    expect(recallReturn(60 * 60_000 + 1)).toBeNull();
  });
});
