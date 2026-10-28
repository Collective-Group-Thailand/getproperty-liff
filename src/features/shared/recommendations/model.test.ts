import { describe, expect, it } from "vitest";

import {
  basePath,
  consentState,
  draftFrom,
  draftProblems,
  fieldOf,
  hasOlder,
  markdownBlocks,
  matchAreas,
  pageFrom,
  shownInEnglishFor,
  updateBody,
  wholeBaht,
  type PublicArea,
  type Recommendations,
} from "./model";

const consent = (over: Partial<Recommendations["consent"]> = {}): Recommendations["consent"] => ({
  purposeKey: "platform.recommendations",
  version: 1,
  language: "th",
  title: "รับห้องแนะนำ",
  bodyMarkdown: "ร่าง",
  effectiveFrom: "2026-10-28T00:00:00+07:00",
  granted: false,
  grantedVersion: null,
  capturedAt: null,
  ...over,
});

const data = (over: Partial<Recommendations> = {}): Recommendations => ({
  consent: consent(),
  preferences: null,
  maxPerWeek: 2,
  quietHours: { start: "21:00", end: "08:00", timezone: "Asia/Bangkok" },
  ...over,
});

const area = (slug: string, name: string, nameEn: string): PublicArea => ({
  slug,
  name,
  nameEn,
  kind: "district",
  line: null,
  count: 1,
  indexable: true,
  band: null,
  province: null,
  provinceEn: null,
});

describe("recommendations model (GL1, D-300)", () => {
  it("reads the consent state only from the API's grant (never pre-ticked)", () => {
    expect(consentState(consent())).toBe("off");
    expect(consentState(consent({ granted: true, grantedVersion: 1 }))).toBe("on");
    expect(consentState(consent({ version: 2, granted: false, grantedVersion: 1 }))).toBe("outdated");
  });

  it("turns the API's Markdown into text runs with bold, never HTML", () => {
    const blocks = markdownBlocks(
      "Draft ⚖\n\n**What we use** only <b>what</b> you type\nyourself.\n\n\n**Profiling** `x`",
    );
    expect(blocks).toEqual([
      [{ text: "Draft ⚖", strong: false }],
      [
        { text: "What we use", strong: true },
        { text: " only <b>what</b> you type yourself.", strong: false },
      ],
      [
        { text: "Profiling", strong: true },
        { text: " x", strong: false },
      ],
    ]);
  });

  it("notes the English text for readers of the other languages", () => {
    expect(shownInEnglishFor("th", { language: "th" })).toBe(false);
    expect(shownInEnglishFor("en", { language: "en" })).toBe(false);
    expect(shownInEnglishFor("my", { language: "en" })).toBe(true);
  });

  it("starts the form from my preferences, else empty in my language with the default quiet hours", () => {
    expect(draftFrom(data(), "km")).toMatchObject({
      areas: [],
      budgetMin: "",
      language: "km",
      quietOwn: false,
      quietStart: "21:00",
      quietEnd: "08:00",
    });
    const saved = draftFrom(
      data({
        consent: consent({ granted: true, grantedVersion: 1 }),
        preferences: {
          areas: ["ari"],
          budgetMin: "8000.00",
          budgetMax: "15000.50",
          unitKinds: ["room"],
          moveInFrom: "2026-12-01",
          moveInTo: null,
          language: "zh",
          quietHours: { start: "22:00", end: "07:00" },
          updatedAt: "2026-10-28T10:00:00+07:00",
        },
      }),
      "th",
    );
    expect(saved).toMatchObject({
      budgetMin: "8000",
      budgetMax: "15000.50",
      language: "zh",
      quietOwn: true,
      quietStart: "22:00",
    });
    expect(wholeBaht("12000.00")).toBe("12000");
  });

  it("sends consentVersion only when ticked now, and nulls for empty fields", () => {
    const draft = draftFrom(data(), "th");
    expect(updateBody(draft, null)).not.toHaveProperty("consentVersion");
    expect(updateBody({ ...draft, budgetMax: " 15000 ", quietOwn: true }, 3)).toMatchObject({
      consentVersion: 3,
      preferences: {
        budgetMin: null,
        budgetMax: "15000",
        quietHours: { start: "21:00", end: "08:00" },
        language: "th",
      },
    });
  });

  it("checks formats before sending and maps API field errors", () => {
    const draft = draftFrom(data(), "th");
    expect(draftProblems({ ...draft, budgetMin: "8,000", quietOwn: true, quietStart: "25:00" })).toEqual([
      "budgetMin",
      "quietHours",
    ]);
    expect(draftProblems({ ...draft, areas: Array.from({ length: 11 }, (_, i) => `a${i}`) })).toEqual(["areas"]);
    expect(fieldOf("preferences.areas[3]")).toBe("areas");
    expect(fieldOf("preferences.budgetMax")).toBe("budgetMax");
    expect(fieldOf("consentVersion")).toBeNull();
  });

  it("searches areas by Thai or English name, leaving out the chosen ones", () => {
    const areas = [
      area("ari", "อารีย์", "Ari"),
      area("phaya-thai", "พญาไท", "Phaya Thai"),
      area("bang-na", "บางนา", "Bang Na"),
    ];
    expect(matchAreas(areas, "a", ["ari"]).map((a) => a.slug)).toEqual(["phaya-thai", "bang-na"]);
    expect(matchAreas(areas, "อารี", []).map((a) => a.slug)).toEqual(["ari"]);
    expect(matchAreas(areas, "  ", [])).toEqual([]);
  });

  it("pages and routes per audience", () => {
    expect(basePath("resident")).toBe("/recommendations");
    expect(basePath("prospect")).toBe("/rent/recommendations");
    expect(pageFrom("2")).toBe(2);
    expect(pageFrom(["x"])).toBe(1);
    expect(hasOlder({ page: 1, perPage: 20, total: 21 }, 1)).toBe(true);
    expect(hasOlder({ page: 2, perPage: 20, total: 21 }, 2)).toBe(false);
  });
});
