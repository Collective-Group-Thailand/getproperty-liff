/**
 * Recommended places (GL1, api G6, D-300) for residents and prospects — one state per account (the same LINE login is
 * one person on both surfaces), like the API's `platform.recommendations` consent with tenant NULL:
 *
 *   - never granted by default (`granted: false`); a grant is `consentVersion` = the current version in the PUT;
 *   - `gp_mock` `recommendations.version=2` publishes version 2 — an earlier grant then counts as not granted
 *     (`recommendations.consent_outdated` for a PUT with version 1);
 *   - withdraw: `granted: false`, preferences unusable (null) — repeating it changes nothing;
 *   - validation like the API: ≤ 10 areas of `GET /v1/public/listings/areas` (unknown → 422 at
 *     `preferences.areas[i]`), money and dates, max not below min, end not before start, quiet hours HH:MM;
 *   - history: subjects with the word `adsseen` were sent four sponsored messages (one listing no longer public).
 *
 * The consent text is the API's seeded draft (th / en, `prisma/seed/data/privacy.ts`), so the screen shows what
 * production shows.
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { mswPath, problem } from "./contract";
import { authenticate } from "./handlers";
import { accountById } from "./state";
import { bangkokIso } from "./tokens";

type Schemas = components["schemas"];
type Audience = "resident" | "prospect";

interface State {
  granted: boolean;
  grantedVersion: number | null;
  capturedAt: string | null;
  preferences: Schemas["AudiencePreferencesDto"] | null;
}

const holder = globalThis as typeof globalThis & { __gpMockRecommendations?: Map<string, State> };
holder.__gpMockRecommendations ??= new Map();
const byUser = holder.__gpMockRecommendations;

function stateOf(userId: string): State {
  let state = byUser.get(userId);
  if (!state) {
    state = { granted: false, grantedVersion: null, capturedAt: null, preferences: null };
    byUser.set(userId, state);
  }
  return state;
}

function currentVersion(request: Request): number {
  const pairs = (request.headers.get("x-gp-mock") ?? "").split(";").map((pair) => pair.trim());
  return pairs.includes("recommendations.version=2") ? 2 : 1;
}

const TEXT = {
  th: {
    title: "รับห้องแนะนำจาก getproperty (รวมโฆษณา)",
    body: [
      "ร่าง ⚖ — เลือกรับหรือไม่ก็ได้ ไม่มีผลต่อการใช้บริการอื่น",
      '**เราจะทำอะไร** getproperty (บริษัท Collective Group (Thailand) จำกัด ผู้ควบคุมข้อมูล) จะส่งห้องเช่าที่น่าจะตรงกับที่คุณมองหาทาง LINE ของ getproperty บางข้อความเป็น **โฆษณา** ที่เจ้าของประกาศหรือนายหน้าจ่ายเงินให้ส่ง ซึ่งจะมีป้าย "โฆษณา" ทุกครั้ง',
      "**ข้อมูลที่ใช้** เฉพาะสิ่งที่คุณกรอกเอง: พื้นที่ งบ ประเภทห้อง ช่วงเวลาที่จะย้ายเข้า ภาษา และเวลาที่ไม่อยากถูกรบกวน",
      "**การจัดกลุ่ม (profiling)** ระบบจับคู่ข้อมูลข้างต้นกับประกาศเพื่อเลือกว่าจะส่งห้องไหนให้คุณ เราไม่ใช้ข้อมูลอ่อนไหว (เช่น ศาสนา สุขภาพ เชื้อชาติ) ไม่ใช้ประวัติการจ่ายค่าเช่า และไม่ใช้ข้อมูลที่ผู้ให้เช่าปัจจุบันเก็บไว้",
      "**ผู้ซื้อโฆษณาไม่เห็นตัวคุณ** เขาเห็นเพียงตัวเลขรวม (ส่งกี่คน คลิกกี่ครั้ง) และจะได้ข้อมูลของคุณเฉพาะเมื่อคุณกดสอบถามหรือนัดดูห้องเอง",
      "**ไม่รบกวนเกินไป** ไม่เกิน 2 ข้อความโฆษณาต่อสัปดาห์ (ค่าตั้งต้น) และไม่ส่งในช่วงเวลาพัก",
      "**เลิกรับได้ทุกเมื่อในแตะเดียว** หลังเลิกรับจะไม่มีข้อความใหม่ และข้อมูลความสนใจจะถูกลบภายใน 30 วัน (หรือขอลบทันทีได้) ดูประวัติสิ่งที่ส่งถึงคุณได้ในหน้าตั้งค่านี้",
    ].join("\n\n"),
  },
  en: {
    title: "Recommended places from getproperty (incl. ads)",
    body: [
      "Draft ⚖ — optional; saying no changes nothing else you use.",
      '**What we do** getproperty (Collective Group (Thailand) Co., Ltd., the data controller) sends you places to rent that seem to fit what you look for, through getproperty’s LINE account. Some messages are **ads** paid for by a listing owner or agent — they are always labelled "Sponsored".',
      "**What we use** only what you type yourself: areas, budget, kind of place, when you want to move in, language and the hours you do not want to be disturbed.",
      "**Profiling** we match the details above with listings to choose what to send you. We never use sensitive data (such as religion, health or ethnicity), your rent payment history or anything your current landlord keeps.",
      "**Advertisers never see you** — only totals (how many got it, how many clicks). They get your details only when you enquire or book a viewing yourself.",
      "**Not too often** at most 2 sponsored messages a week (default) and none during quiet hours.",
      "**Stop any time with one tap.** Nothing new is sent after that and your preferences are deleted within 30 days (or at once on request). You can see what was sent to you on this settings page.",
    ].join("\n\n"),
  },
} as const;

/** The API's rule: the text in the person's language — Thai, else English. */
const textLanguage = (request: Request): "th" | "en" =>
  (request.headers.get("accept-language") ?? "th").slice(0, 2).toLowerCase() === "th" ? "th" : "en";

function view(request: Request, state: State): Schemas["RecommendationsDto"] {
  const version = currentVersion(request);
  const language = textLanguage(request);
  const granted = state.granted && (state.grantedVersion ?? 0) >= version;
  return {
    consent: {
      purposeKey: "platform.recommendations",
      version,
      language,
      title: TEXT[language].title,
      bodyMarkdown: TEXT[language].body,
      effectiveFrom: "2026-10-28T00:00:00+07:00",
      granted,
      grantedVersion: state.granted ? state.grantedVersion : null,
      capturedAt: state.capturedAt,
    },
    preferences: granted ? state.preferences : null,
    maxPerWeek: 2,
    quietHours: { start: "21:00", end: "08:00", timezone: "Asia/Bangkok" },
  };
}

/** Districts and stations the mock lists publicly (`GET /v1/public/listings/areas`). */
export const MOCK_AREAS: Schemas["PublicAreaDto"][] = [
  ["ari", "station", "อารีย์", "Ari", "BTS สุขุมวิท"],
  ["phaya-thai", "district", "พญาไท", "Phaya Thai", null],
  ["chatuchak", "district", "จตุจักร", "Chatuchak", null],
  ["sathon", "district", "สาทร", "Sathon", null],
  ["huai-khwang", "district", "ห้วยขวาง", "Huai Khwang", null],
  ["bang-na", "district", "บางนา", "Bang Na", null],
  ["on-nut", "station", "อ่อนนุช", "On Nut", "BTS สุขุมวิท"],
  ["sutthisan", "station", "สุทธิสาร", "Sutthisan", "MRT สายสีน้ำเงิน"],
  ["lat-phrao", "district", "ลาดพร้าว", "Lat Phrao", null],
  ["bang-sue", "district", "บางซื่อ", "Bang Sue", null],
  ["thong-lo", "station", "ทองหล่อ", "Thong Lo", "BTS สุขุมวิท"],
  ["rama-9", "station", "พระราม 9", "Phra Ram 9", "MRT สายสีน้ำเงิน"],
].map(([slug, kind, name, nameEn, line]) => ({
  slug: slug as string,
  kind: kind as Schemas["PublicAreaKind"],
  name: name as string,
  nameEn: nameEn as string,
  line: line as string | null,
  count: 6,
  indexable: true,
  band: { p25: "9000.00", p50: "12000.00", p75: "16000.00" },
  province: "กรุงเทพมหานคร",
  provinceEn: "Bangkok",
}));

const MONEY = /^\d{1,9}(\.\d{1,2})?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const KINDS = new Set(["condo_unit", "house", "townhouse", "room"]);
const LANGUAGES = new Set(["th", "en", "my", "km", "lo", "zh"]);

type FieldError = { path: string; code: string; message: string };

function validate(input: Schemas["AudiencePreferencesInputDto"]): FieldError[] {
  const errors: FieldError[] = [];
  const areas = input.areas ?? [];
  if (areas.length > 10) errors.push({ path: "preferences.areas", code: "max", message: "up to 10 areas" });
  areas.forEach((slug, i) => {
    if (!MOCK_AREAS.some((a) => a.slug === slug))
      errors.push({
        path: `preferences.areas[${i}]`,
        code: "unknown",
        message: "an area of /v1/public/listings/areas",
      });
  });
  if ((input.unitKinds ?? []).some((k) => !KINDS.has(k)))
    errors.push({ path: "preferences.unitKinds", code: "enum", message: [...KINDS].join(", ") });
  for (const key of ["budgetMin", "budgetMax"] as const) {
    const v = input[key];
    if (v != null && !MONEY.test(v))
      errors.push({ path: `preferences.${key}`, code: "money", message: "a decimal string" });
  }
  if (input.budgetMin && input.budgetMax && Number(input.budgetMax) < Number(input.budgetMin))
    errors.push({ path: "preferences.budgetMax", code: "range", message: "not below budgetMin" });
  for (const key of ["moveInFrom", "moveInTo"] as const) {
    const v = input[key];
    if (v != null && !DAY.test(v)) errors.push({ path: `preferences.${key}`, code: "date", message: "YYYY-MM-DD" });
  }
  if (input.moveInFrom && input.moveInTo && input.moveInTo < input.moveInFrom)
    errors.push({ path: "preferences.moveInTo", code: "range", message: "not before moveInFrom" });
  if (input.language != null && !LANGUAGES.has(input.language))
    errors.push({ path: "preferences.language", code: "enum", message: [...LANGUAGES].join(", ") });
  const quiet = input.quietHours;
  if (quiet && !(CLOCK.test(quiet.start) && CLOCK.test(quiet.end)))
    errors.push({ path: "preferences.quietHours", code: "time", message: "{start, end} as HH:MM" });
  return errors;
}

const money = (v: string | null | undefined) =>
  v ? (v.includes(".") ? v.padEnd(v.indexOf(".") + 3, "0") : `${v}.00`) : null;

function history(userId: string, language: "th" | "en"): Schemas["RecommendationHistoryItemDto"][] {
  const subject = accountById(userId)?.subject ?? "";
  if (!subject.includes("adsseen")) return [];
  const label = language === "en" ? "Sponsored" : "โฆษณา";
  const day = 86_400_000;
  const base = Date.parse("2026-10-27T19:30:00+07:00");
  return [
    {
      listings: [{ slug: "condo-1br-a1b2c3d4e5", title: "คอนโด 1 ห้องนอน ใกล้ BTS อารีย์", public: true }],
      sponsor: "มาลี มีสุข",
    },
    {
      listings: [
        { slug: "studio-ratchada-0f9e8d7c6b", title: "สตูดิโอ รัชดา ใกล้ MRT สุทธิสาร", public: false },
        { slug: "condo-1br-a1b2c3d4e5", title: "คอนโด 1 ห้องนอน ใกล้ BTS อารีย์", public: true },
      ],
      sponsor: "บ้านเช่าสมใจ",
    },
    {
      listings: [{ slug: "condo-1br-a1b2c3d4e5", title: "คอนโด 1 ห้องนอน ใกล้ BTS อารีย์", public: true }],
      sponsor: "มาลี มีสุข",
    },
    {
      listings: [{ slug: "condo-1br-a1b2c3d4e5", title: "คอนโด 1 ห้องนอน ใกล้ BTS อารีย์", public: true }],
      sponsor: "มาลี มีสุข",
    },
  ].map((item, i) => ({
    id: `5e1a7c3b-0d2f-4a6b-9c8d-00000000000${i + 1}`,
    sentAt: bangkokIso(base - i * 4 * day),
    label,
    ...item,
  }));
}

function handlers(audience: Audience): HttpHandler[] {
  const base = `/v1/${audience}/me/recommendations`;
  return [
    http.get(mswPath(base), ({ request }) => {
      const auth = authenticate(request, audience, `${audience}.recommendations.get`);
      if (auth instanceof Response) return auth;
      return HttpResponse.json(view(request, stateOf(auth.account.userId)));
    }),
    http.put(mswPath(base), async ({ request }) => {
      const op = `${audience}.recommendations.update`;
      const auth = authenticate(request, audience, op);
      if (auth instanceof Response) return auth;
      const body = (await request.json()) as Schemas["RecommendationsUpdateDto"];
      const state = stateOf(auth.account.userId);
      const version = currentVersion(request);
      if (body.consentVersion !== undefined && body.consentVersion !== version) {
        return problem(op, "recommendations.consent_outdated");
      }
      const grantedNow = body.consentVersion === version;
      const alreadyGranted = state.granted && (state.grantedVersion ?? 0) >= version;
      if (!grantedNow && !alreadyGranted) {
        return problem(op, state.granted ? "recommendations.consent_outdated" : "recommendations.consent_required");
      }
      const input = body.preferences ?? {};
      const errors = validate(input);
      if (errors.length > 0) return problem(op, "validation.failed", { errors });
      if (grantedNow) {
        state.granted = true;
        state.grantedVersion = version;
        state.capturedAt = bangkokIso(Date.now());
      }
      state.preferences = {
        areas: input.areas ?? [],
        budgetMin: money(input.budgetMin),
        budgetMax: money(input.budgetMax),
        unitKinds: input.unitKinds ?? [],
        moveInFrom: input.moveInFrom ?? null,
        moveInTo: input.moveInTo ?? null,
        language: input.language ?? (textLanguage(request) === "th" ? "th" : "en"),
        quietHours: input.quietHours ?? null,
        updatedAt: bangkokIso(Date.now()),
      };
      return HttpResponse.json(view(request, state));
    }),
    http.post(mswPath(`${base}/actions/withdraw`), ({ request }) => {
      const auth = authenticate(request, audience, `${audience}.recommendations.withdraw`);
      if (auth instanceof Response) return auth;
      const state = stateOf(auth.account.userId);
      if (state.granted) {
        state.granted = false;
        state.capturedAt = bangkokIso(Date.now());
        state.preferences = null;
      }
      return HttpResponse.json(view(request, state));
    }),
    http.get(mswPath(`${base}/history`), ({ request }) => {
      const auth = authenticate(request, audience, `${audience}.recommendations.history`);
      if (auth instanceof Response) return auth;
      const url = new URL(request.url);
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("perPage")) || 25));
      const all = history(auth.account.userId, textLanguage(request));
      return HttpResponse.json({
        data: all.slice((page - 1) * perPage, page * perPage),
        meta: { page, perPage, total: all.length },
      });
    }),
  ];
}

export const recommendationHandlers: HttpHandler[] = [
  ...handlers("resident"),
  ...handlers("prospect"),
  http.get(mswPath("/v1/public/listings/areas"), () =>
    HttpResponse.json({ data: MOCK_AREAS } satisfies Schemas["PublicAreasDto"]),
  ),
];
