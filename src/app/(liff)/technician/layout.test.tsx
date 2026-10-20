import { afterEach, describe, expect, it } from "vitest";

import TechnicianLayout from "./layout";

/** L4 4.4 §1 — the technician screens exist only with FEATURE_TECHNICIAN=1 (per deployment, at request time). */
describe("technician screens behind the flag", () => {
  const before = process.env.FEATURE_TECHNICIAN;
  afterEach(() => {
    process.env.FEATURE_TECHNICIAN = before;
  });

  it("are a 404 while FEATURE_TECHNICIAN is off", () => {
    process.env.FEATURE_TECHNICIAN = "";
    expect(() => TechnicianLayout({ children: null })).toThrow(/NEXT_HTTP_ERROR_FALLBACK;404/);
  });

  it("render their children when it is on", () => {
    process.env.FEATURE_TECHNICIAN = "1";
    expect(TechnicianLayout({ children: "screens" })).toBe("screens");
  });
});
