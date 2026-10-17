// copied from getproperty-web@f57d4dc until collective-shared exists (D-155) — adapted: liff keeps its own per-domain status files (glyph icons, D-179)
import { describe, expect, it } from "vitest";

import { ICONS } from "@/ui/icons/registry";
import { IconAlert } from "@/ui/icons/glyphs/alert";
import { IconCheck } from "@/ui/icons/glyphs/check";

import { defineStatuses, READING_SOURCE } from "./index";

describe("status scaffolding", () => {
  it("derives the label key from the domain and value", () => {
    const map = defineStatuses<"a" | "b">("thing", {
      a: { tone: "success", icon: IconCheck },
      b: { tone: "danger", icon: IconAlert },
    });
    expect(map.a.labelKey).toBe("status.thing.a");
    expect(map.b.tone).toBe("danger");
  });
  it("names only icons that exist in the registry", () => {
    for (const meta of Object.values(READING_SOURCE)) expect(Object.values(ICONS)).toContain(meta.icon);
  });
  it("marks an estimated reading as needing attention, not danger (D-012, D-100)", () => {
    expect(READING_SOURCE.estimated.tone).toBe("warning");
  });
});
