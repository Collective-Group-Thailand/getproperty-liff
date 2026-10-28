import type { Locale } from "@/i18n/routing";
import type { Schemas } from "@/lib/api/types";

/**
 * Recommended places (GL1, api G6, D-300): pure helpers shared by the resident and the prospect screen. Nothing here
 * decides consent — the API's `granted` is the only truth (never pre-ticked: anything but an explicit grant of the
 * current version is "off").
 */
export type Recommendations = Schemas["RecommendationsDto"];
export type RecommendationsConsent = Schemas["RecommendationsConsentDto"];
export type HistoryItem = Schemas["RecommendationHistoryItemDto"];
export type PublicArea = Schemas["PublicAreaDto"];
export type UnitKind = Schemas["PortfolioUnitKind"];
export type MessageLanguage = Schemas["ResidentLanguage"];
export type RecommendationsAudience = "resident" | "prospect";

export const UNIT_KINDS: readonly UnitKind[] = ["condo_unit", "room", "house", "townhouse"];
export const MESSAGE_LANGUAGES: readonly MessageLanguage[] = ["th", "en", "my", "km", "lo", "zh"];
/** The API's limit (`preferences.areas` ≤ 10, G6); the API refuses more, the form never offers more. */
export const MAX_AREAS = 10;
/** History entries previewed on the settings screen (the full list is its own page). */
export const HISTORY_PREVIEW = 3;
export const HISTORY_PER_PAGE = 20;

/** Where the screen lives for each audience (`/recommendations` is the LINE message's link; residents stay there). */
export function basePath(audience: RecommendationsAudience): string {
  return audience === "resident" ? "/recommendations" : "/rent/recommendations";
}

/**
 * - `on`: granted at the current version;
 * - `outdated`: granted an earlier version — a new text asks again (nothing is sent meanwhile);
 * - `off`: never granted or withdrawn.
 */
export function consentState(consent: RecommendationsConsent): "on" | "outdated" | "off" {
  if (consent.granted) return "on";
  return consent.grantedVersion !== null && consent.grantedVersion < consent.version ? "outdated" : "off";
}

export type Inline = { text: string; strong: boolean };

/**
 * The API's Markdown (purpose and profiling note) as paragraphs of plain and **bold** runs — rendered as text nodes,
 * never as HTML. Heading / quote markers and backticks are dropped; the words are the API's, untouched.
 */
export function markdownBlocks(markdown: string): Inline[][] {
  return markdown
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .replace(/^\s*(#{1,6}|>)\s+/, "")
        .replace(/\s*\n\s*/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .map((block) =>
      block
        .split(/(\*\*[^*]+\*\*)/)
        .filter(Boolean)
        .map((part) => {
          const strong = /^\*\*[^*]+\*\*$/.test(part);
          return { text: (strong ? part.slice(2, -2) : part).replace(/`/g, ""), strong };
        })
        .filter((run) => run.text.length > 0),
    )
    .filter((runs) => runs.length > 0);
}

/** The consent text is published in Thai and English only: Thai readers get Thai, everyone else English. */
export function shownInEnglishFor(locale: Locale, consent: Pick<RecommendationsConsent, "language">): boolean {
  return locale !== "en" && consent.language === "en";
}

/** An area's name in the reader's language (the API gives Thai and English). */
export function areaName(area: Pick<PublicArea, "name" | "nameEn">, locale: Locale): string {
  return locale === "th" ? area.name : area.nameEn;
}

/** Areas whose Thai or English name contains the query (case-insensitive), the chosen ones left out. */
export function matchAreas(
  areas: readonly PublicArea[],
  query: string,
  chosen: readonly string[],
  limit = 12,
): PublicArea[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return areas
    .filter((area) => !chosen.includes(area.slug))
    .filter((area) => area.name.toLowerCase().includes(q) || area.nameEn.toLowerCase().includes(q))
    .slice(0, limit);
}

export interface PreferencesDraft {
  areas: string[];
  budgetMin: string;
  budgetMax: string;
  unitKinds: UnitKind[];
  moveInFrom: string;
  moveInTo: string;
  language: MessageLanguage;
  quietOwn: boolean;
  quietStart: string;
  quietEnd: string;
}

function isMessageLanguage(value: unknown): value is MessageLanguage {
  return typeof value === "string" && (MESSAGE_LANGUAGES as readonly string[]).includes(value);
}

/** The form's starting values: my saved preferences, else empty (= anything) in my language. */
export function draftFrom(data: Recommendations, locale: Locale): PreferencesDraft {
  const p = data.preferences;
  return {
    areas: p?.areas ?? [],
    budgetMin: p?.budgetMin ? wholeBaht(p.budgetMin) : "",
    budgetMax: p?.budgetMax ? wholeBaht(p.budgetMax) : "",
    unitKinds: p?.unitKinds ?? [],
    moveInFrom: p?.moveInFrom ?? "",
    moveInTo: p?.moveInTo ?? "",
    language: isMessageLanguage(p?.language) ? p.language : locale,
    quietOwn: Boolean(p?.quietHours),
    quietStart: p?.quietHours?.start ?? data.quietHours.start,
    quietEnd: p?.quietHours?.end ?? data.quietHours.end,
  };
}

/** `8000.00` → `8000` for the input (string slicing only — money is never computed here). */
export function wholeBaht(amount: string): string {
  return /^\d+\.0+$/.test(amount) ? amount.replace(/\.0+$/, "") : amount;
}

const MONEY = /^\d{1,9}(\.\d{1,2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export type DraftField = "areas" | "budgetMin" | "budgetMax" | "moveInFrom" | "moveInTo" | "quietHours" | "language";

/** Format checks only (ranges are the API's, answered as field errors) — so a typo never reaches the API. */
export function draftProblems(draft: PreferencesDraft): DraftField[] {
  const problems: DraftField[] = [];
  if (draft.areas.length > MAX_AREAS) problems.push("areas");
  if (draft.budgetMin && !MONEY.test(draft.budgetMin.trim())) problems.push("budgetMin");
  if (draft.budgetMax && !MONEY.test(draft.budgetMax.trim())) problems.push("budgetMax");
  if (draft.moveInFrom && !DAY.test(draft.moveInFrom)) problems.push("moveInFrom");
  if (draft.moveInTo && !DAY.test(draft.moveInTo)) problems.push("moveInTo");
  if (draft.quietOwn && !(CLOCK.test(draft.quietStart) && CLOCK.test(draft.quietEnd))) problems.push("quietHours");
  return problems;
}

/**
 * The `PUT …/me/recommendations` body. `consentVersion` only when the person ticked the box for that version now —
 * never by default, never carried over from an earlier version.
 */
export function updateBody(
  draft: PreferencesDraft,
  acceptedVersion: number | null,
): Schemas["RecommendationsUpdateDto"] {
  const text = (value: string) => (value.trim() ? value.trim() : null);
  return {
    ...(acceptedVersion !== null ? { consentVersion: acceptedVersion } : {}),
    preferences: {
      areas: draft.areas,
      budgetMin: text(draft.budgetMin),
      budgetMax: text(draft.budgetMax),
      unitKinds: draft.unitKinds,
      moveInFrom: text(draft.moveInFrom),
      moveInTo: text(draft.moveInTo),
      language: draft.language,
      quietHours: draft.quietOwn ? { start: draft.quietStart, end: draft.quietEnd } : null,
    },
  };
}

/**
 * The form field an API validation error belongs to (`preferences.areas[2]`, `preferences.budgetMax` …). Unknown
 * paths return null (shown as the general problem).
 */
export function fieldOf(path: string): DraftField | null {
  const match = /^preferences\.(areas|budgetMin|budgetMax|moveInFrom|moveInTo|quietHours|language)\b/.exec(path);
  return match ? (match[1] as DraftField) : null;
}

/** Problems that mean "read the consent text again": the screen re-reads it and asks for a new tick. */
export const CONSENT_AGAIN = new Set(["recommendations.consent_required", "recommendations.consent_outdated"]);

export function pageFrom(raw: string | string[] | undefined): number {
  const parsed = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export function hasOlder(meta: Schemas["PageMeta"], page: number): boolean {
  return page * meta.perPage < meta.total;
}
