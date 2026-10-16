import { describe, expect, it } from "vitest";

import { technicianEnabled } from "./flags";

describe("technicianEnabled", () => {
  it("is off unless FEATURE_TECHNICIAN=1 (R2)", () => {
    expect(technicianEnabled({})).toBe(false);
    expect(technicianEnabled({ FEATURE_TECHNICIAN: "0" })).toBe(false);
    expect(technicianEnabled({ FEATURE_TECHNICIAN: "true" })).toBe(false);
    expect(technicianEnabled({ FEATURE_TECHNICIAN: "1" })).toBe(true);
  });
});
