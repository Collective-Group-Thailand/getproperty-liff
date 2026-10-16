// copied from getproperty-web@08ff63b until collective-shared exists (D-155) — adapted: single resident zone
import { describe, expect, it } from "vitest";

import { dataThemeAttribute, isThemeChoice, themeChoicesFor, ZONE_DEFAULT_THEME } from "./themes";

describe("theme selection", () => {
  it("validates the cookie value", () => {
    expect(isThemeChoice("dark")).toBe(true);
    expect(isThemeChoice("hc")).toBe(true);
    expect(isThemeChoice("sepia")).toBe(false);
    expect(isThemeChoice(undefined)).toBe(false);
  });
  it("stamps nothing for `system` so prefers-color-scheme decides", () => {
    expect(dataThemeAttribute("system")).toBeUndefined();
    expect(dataThemeAttribute("dark")).toBe("dark");
  });
  it("offers system, light and dark to residents — no high contrast toggle", () => {
    expect(themeChoicesFor("resident")).toEqual(["system", "light", "dark"]);
  });
  it("follows the phone by default", () => {
    expect(ZONE_DEFAULT_THEME.resident).toBe("system");
  });
});
