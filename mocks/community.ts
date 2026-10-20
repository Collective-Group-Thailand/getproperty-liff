/**
 * Community and access in the mock API — B5.3 (D-073, D-212) and B5.2 (D-070, D-071, D-211): announcements with read
 * receipts, parcels with the pick-up PIN, facilities with their booking policy and busy times, building rules with
 * the acknowledgement, contacts, and my own door codes with my unit's unlock log. Shapes are the contract's.
 *
 * Scenario words in the fake LINE subject:
 *
 *   (default)     two announcements (one pinned, unread), a parcel waiting at the desk and one picked up, a meeting
 *                 room and a fitness room (60-minute slots, 08:00–22:00, 2 per unit per week), house rules v3 not yet
 *                 acknowledged, four contacts, a door code for A-201 and the building door, five unlocks
 *   …nolocks…     no smart locks (no codes, no log)
 *   …novisitor…   the operator does not let residents create visitor codes (CONTRACT-REQUEST #26)
 */
import { createHash } from "node:crypto";

import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { example, mswPath, problem } from "./contract";
import { emit } from "./events";
import { authenticate } from "./handlers";
import { UNIT_A, type MockAccount } from "./state";
import { bangkokIso } from "./tokens";

type Schemas = components["schemas"];

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function uuidFrom(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** `YYYY-MM-DD` in Bangkok. */
function bangkokDay(ms: number): string {
  return new Date(ms + 7 * HOUR).toISOString().slice(0, 10);
}

interface MockAnnouncement {
  id: string;
  pinned: boolean;
  publishedAt: string;
  th: { title: string; body: string };
  en: { title: string; body: string };
  readAt: string | null;
}

interface MockCommunity {
  announcements: MockAnnouncement[];
  parcels: Schemas["ResidentParcelDto"][];
  bookings: Schemas["BookingDto"][];
  rulesAcknowledgedAt: string | null;
  credentials: Schemas["RevealedCredentialDto"][];
  events: Schemas["AccessEventDto"][];
  visitorAllowed: boolean;
}

const holder = globalThis as typeof globalThis & { __gpMockCommunity?: Map<string, MockCommunity> };
holder.__gpMockCommunity ??= new Map();
const communities = holder.__gpMockCommunity;

/** Facilities of building A (ids derived, so a measured URL is stable). */
export const FACILITIES: Schemas["FacilityDto"][] = [
  {
    id: uuidFrom("facility#meeting"),
    buildingId: UNIT_A.buildingId,
    name: "ห้องประชุมชั้น 2",
    kind: "meeting_room",
    capacity: 8,
    isActive: true,
    bookingPolicy: {
      slotMinutes: 60,
      openFrom: "08:00",
      openTo: "22:00",
      maxDurationMinutes: 120,
      maxAdvanceDays: 14,
      maxPerUnitPerWeek: 2,
      requiresApproval: false,
    },
  },
  {
    id: uuidFrom("facility#fitness"),
    buildingId: UNIT_A.buildingId,
    name: "ห้องฟิตเนส",
    kind: "fitness",
    capacity: 4,
    isActive: true,
    bookingPolicy: {
      slotMinutes: 60,
      openFrom: "06:00",
      openTo: "21:00",
      maxDurationMinutes: 60,
      maxAdvanceDays: 7,
      maxPerUnitPerWeek: 2,
      requiresApproval: true,
    },
  },
];

const OTHER_UNIT = uuidFrom("unit#A-305");

export function communityOf(account: MockAccount): MockCommunity {
  const existing = communities.get(account.userId);
  if (existing) return existing;
  const has = (word: string) => account.subject.toLowerCase().includes(word);
  const now = Date.now();
  const unit = account.units[0] ?? UNIT_A;
  const credential = example<Schemas["RevealedCredentialsDto"]>("resident.access.credentials").data[0]!;
  const lease = uuidFrom(`lease#${account.subject}`);
  const community: MockCommunity = {
    announcements: [
      {
        id: uuidFrom(`announcement#water#${account.subject}`),
        pinned: true,
        publishedAt: bangkokIso(now - 2 * HOUR),
        th: {
          title: "งดจ่ายน้ำชั่วคราว วันเสาร์ 09:00–12:00 น.",
          body: "อาคารจะล้างถังเก็บน้ำบนดาดฟ้า ระหว่างนี้น้ำประปาจะไม่ไหล กรุณาสำรองน้ำไว้ใช้ล่วงหน้า ขออภัยในความไม่สะดวก",
        },
        en: {
          title: "Water off on Saturday, 09:00–12:00",
          body: "The building will clean the rooftop water tank. Tap water will be off during that time — please store some water beforehand. Sorry for the inconvenience.",
        },
        readAt: null,
      },
      {
        id: uuidFrom(`announcement#parking#${account.subject}`),
        pinned: false,
        publishedAt: bangkokIso(now - 5 * DAY),
        th: { title: "ทาสีที่จอดรถชั้น B1", body: "ช่วงวันที่ 10–12 กรุณาจอดรถที่ชั้น B2 แทน" },
        en: { title: "Painting the B1 car park", body: "From the 10th to the 12th, please park on B2 instead." },
        readAt: bangkokIso(now - 4 * DAY),
      },
    ],
    parcels: [
      {
        ...example<Schemas["ResidentParcelsDto"]>("resident.community.parcels").data[0]!,
        id: uuidFrom(`parcel#waiting#${account.subject}`),
        unitId: unit.unitId,
        unitNo: unit.unitNo,
        buildingId: unit.buildingId,
        receivedAt: bangkokIso(now - 3 * HOUR),
        notifiedAt: bangkokIso(now - 3 * HOUR + 60_000),
        status: "notified",
        pin: "482913",
      },
      {
        ...example<Schemas["ResidentParcelsDto"]>("resident.community.parcels").data[0]!,
        id: uuidFrom(`parcel#done#${account.subject}`),
        unitId: unit.unitId,
        unitNo: unit.unitNo,
        buildingId: unit.buildingId,
        carrier: "Thailand Post",
        trackingNo: "EF123456789TH",
        receivedAt: bangkokIso(now - 6 * DAY),
        notifiedAt: bangkokIso(now - 6 * DAY + 60_000),
        pickedUpAt: bangkokIso(now - 5 * DAY),
        pickupConfirmedBy: "resident_pin",
        status: "picked_up",
        pin: null,
      },
    ],
    bookings: [],
    rulesAcknowledgedAt: null,
    credentials: has("nolocks")
      ? []
      : [
          {
            ...credential,
            id: uuidFrom(`credential#unit#${account.subject}`),
            holderName: account.displayName,
            leaseId: lease,
            lockId: uuidFrom(`lock#${unit.unitId}`),
            lockName: `ประตูห้อง ${unit.unitNo}`,
            pin: "246810",
            unitId: unit.unitId,
            unitNo: unit.unitNo,
            validFrom: bangkokIso(now - 60 * DAY),
          },
          {
            ...credential,
            id: uuidFrom(`credential#door#${account.subject}`),
            holderName: account.displayName,
            leaseId: lease,
            lockId: uuidFrom(`lock#door#${unit.buildingId}`),
            lockName: `ประตูหน้า${unit.buildingName}`,
            pin: "135790",
            unitId: null,
            unitNo: null,
            validFrom: bangkokIso(now - 60 * DAY),
          },
        ],
    events: [],
    visitorAllowed: !has("novisitor"),
  };
  if (!has("nolocks")) {
    const lockId = uuidFrom(`lock#${unit.unitId}`);
    community.events = [3, 9, 26, 30, 50].map((hoursAgo, index) => ({
      id: uuidFrom(`event#${account.subject}#${index}`),
      lockId,
      credentialId: community.credentials[0]!.id,
      unitId: unit.unitId,
      result: index === 3 ? "denied" : "success",
      source: index === 2 ? "app" : "pin",
      time: bangkokIso(now - hoursAgo * HOUR),
    }));
  }
  // Someone else holds tomorrow 18:00–19:00 in the meeting room (busy, not named).
  const tomorrow = bangkokDay(now + DAY);
  community.bookings.push({
    id: uuidFrom(`booking#other#${account.subject}`),
    facilityId: FACILITIES[0]!.id,
    facilityName: FACILITIES[0]!.name,
    unitId: OTHER_UNIT,
    unitNo: "A-305",
    startsAt: `${tomorrow}T18:00:00+07:00`,
    endsAt: `${tomorrow}T19:00:00+07:00`,
    status: "confirmed",
    note: null,
    cancelReason: null,
  });
  communities.set(account.userId, community);
  return community;
}

function languageOf(request: Request): "th" | "en" {
  return (request.headers.get("accept-language") ?? "th").toLowerCase().startsWith("th") ? "th" : "en";
}

function announcementView(a: MockAnnouncement, language: "th" | "en"): Schemas["ResidentAnnouncementDto"] {
  const text = a[language];
  return {
    id: a.id,
    title: text.title,
    body: text.body,
    language,
    pinned: a.pinned,
    publishedAt: a.publishedAt,
    readAt: a.readAt,
  };
}

function announcementsOf(community: MockCommunity, language: "th" | "en") {
  return {
    data: [...community.announcements]
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt))
      .map((a) => announcementView(a, language)),
  };
}

const RULES = {
  th: {
    title: "ระเบียบอาคาร ฉบับที่ 3",
    body: "1. งดส่งเสียงดังระหว่าง 22:00–07:00 น.\n2. ทิ้งขยะที่จุดทิ้งขยะชั้น 1 แยกขยะรีไซเคิล\n3. ห้ามสูบบุหรี่ในห้องและพื้นที่ส่วนกลาง\n4. ผู้มาเยี่ยมต้องลงชื่อที่ล็อบบี้",
  },
  en: {
    title: "House rules, version 3",
    body: "1. Keep quiet between 22:00 and 07:00.\n2. Put rubbish at the ground-floor bins and separate recyclables.\n3. No smoking in units or common areas.\n4. Visitors sign in at the lobby.",
  },
};

function rulesView(community: MockCommunity, language: "th" | "en"): Schemas["ResidentRulesDto"] {
  return {
    ruleId: uuidFrom("rules#A#3"),
    version: 3,
    effectiveFrom: "2026-10-01",
    title: RULES[language].title,
    body: RULES[language].body,
    language,
    acknowledgedAt: community.rulesAcknowledgedAt,
  };
}

const CONTACTS: Schemas["ContactDto"][] = [
  {
    id: uuidFrom("contact#emergency"),
    kind: "emergency",
    name: "เหตุด่วนเหตุร้าย (ตำรวจ)",
    phone: "191",
    lineId: null,
    notes: null,
    buildingId: null,
    sortOrder: 1,
  },
  {
    id: uuidFrom("contact#fire"),
    kind: "emergency",
    name: "ดับเพลิง",
    phone: "199",
    lineId: null,
    notes: null,
    buildingId: null,
    sortOrder: 2,
  },
  {
    id: uuidFrom("contact#office"),
    kind: "building",
    name: "สำนักงานอาคาร A",
    phone: "021234567",
    lineId: "@getproperty-a",
    notes: "เปิด 08:00–20:00 น. ทุกวัน",
    buildingId: UNIT_A.buildingId,
    sortOrder: 3,
  },
  {
    id: uuidFrom("contact#plumber"),
    kind: "vendor",
    name: "ช่างประปาประจำอาคาร",
    phone: null,
    lineId: "plumber-a",
    notes: null,
    buildingId: UNIT_A.buildingId,
    sortOrder: 4,
  },
  {
    id: uuidFrom("contact#pea"),
    kind: "utility",
    name: "การไฟฟ้านครหลวง",
    phone: "1130",
    lineId: null,
    notes: null,
    buildingId: null,
    sortOrder: 5,
  },
];

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

function live(booking: Schemas["BookingDto"]) {
  return booking.status === "requested" || booking.status === "confirmed";
}

/** CONTRACT-REQUEST #26 — a visitor code (≤ the operator's hours, a unit I occupy). */
export function visitorCodes(
  account: MockAccount,
  body: { unitId?: unknown; visitorName?: unknown; validFrom?: unknown; validTo?: unknown } | null,
): Schemas["RevealedCredentialDto"] | Response {
  const op = "resident.access.credentials";
  const community = communityOf(account);
  if (!community.visitorAllowed || community.credentials.length === 0) return problem(op, "auth.forbidden");
  const unit = account.units.find((u) => u.unitId === body?.unitId);
  const name = typeof body?.visitorName === "string" ? body.visitorName.trim() : "";
  const from = typeof body?.validFrom === "string" ? Date.parse(body.validFrom) : NaN;
  const to = typeof body?.validTo === "string" ? Date.parse(body.validTo) : NaN;
  if (!unit || !name || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 24 * HOUR) {
    return problem(op, "validation.failed");
  }
  const code: Schemas["RevealedCredentialDto"] = {
    ...community.credentials[0]!,
    id: crypto.randomUUID(),
    holderKind: "visitor",
    holderName: name,
    holderPartyId: null,
    holderUserId: null,
    leaseId: null,
    pin: String(100000 + Math.floor(Math.random() * 900000)),
    validFrom: bangkokIso(from),
    validTo: bangkokIso(to),
    createdAt: bangkokIso(Date.now()),
    status: "active",
  };
  community.credentials.push(code);
  return code;
}

async function json<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export const communityHandlers: HttpHandler[] = [
  // ── announcements ─────────────────────────────────────────────────────────────────────────────
  http.get(mswPath("/v1/resident/announcements"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.community.announcements");
    if (auth instanceof Response) return auth;
    if (auth.account.units.length === 0) return HttpResponse.json({ data: [] });
    return HttpResponse.json(announcementsOf(communityOf(auth.account), languageOf(request)));
  }),

  http.post(mswPath("/v1/resident/announcements/:announcementId/actions/read"), ({ request, params }) => {
    const op = "resident.community.readAnnouncement";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const community = communityOf(auth.account);
    const found = community.announcements.find((a) => a.id === params.announcementId);
    if (!found) return problem(op, "http.not_found");
    found.readAt ??= bangkokIso(Date.now());
    return HttpResponse.json(announcementsOf(community, languageOf(request)));
  }),

  // ── parcels ───────────────────────────────────────────────────────────────────────────────────
  http.get(mswPath("/v1/resident/parcels"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.community.parcels");
    if (auth instanceof Response) return auth;
    if (auth.account.units.length === 0) return HttpResponse.json({ data: [] });
    return HttpResponse.json({ data: communityOf(auth.account).parcels });
  }),

  // ── facilities and bookings ───────────────────────────────────────────────────────────────────
  http.get(mswPath("/v1/resident/facilities"), ({ request }) => {
    const op = "resident.community.facilities";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unitId = new URL(request.url).searchParams.get("unitId");
    const unit = auth.account.units.find((u) => u.unitId === unitId);
    if (!unit) return problem(op, "http.not_found");
    return HttpResponse.json({ data: unit.buildingId === UNIT_A.buildingId ? FACILITIES : [] });
  }),

  http.get(mswPath("/v1/resident/facilities/:facilityId/availability"), ({ request, params }) => {
    const op = "resident.community.availability";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const facility = FACILITIES.find((f) => f.id === params.facilityId);
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!facility || !auth.account.units.some((u) => u.buildingId === facility.buildingId)) {
      return problem(op, "http.not_found");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return problem(op, "validation.failed");
    const mine = new Set(auth.account.units.map((u) => u.unitId));
    const busy = communityOf(auth.account)
      .bookings.filter((b) => b.facilityId === facility.id && live(b) && b.startsAt.startsWith(date))
      .map((b) => ({ startsAt: b.startsAt, endsAt: b.endsAt, status: b.status, mine: mine.has(b.unitId) }));
    return HttpResponse.json({ date, facility, busy });
  }),

  http.get(mswPath("/v1/resident/facility-bookings"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.community.bookings");
    if (auth instanceof Response) return auth;
    const mine = new Set(auth.account.units.map((u) => u.unitId));
    const data = communityOf(auth.account)
      .bookings.filter((b) => mine.has(b.unitId))
      .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    return HttpResponse.json({ data });
  }),

  http.post(mswPath("/v1/resident/facility-bookings"), async ({ request }) => {
    const op = "resident.community.book";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const body = await json<{
      facilityId?: unknown;
      unitId?: unknown;
      startsAt?: unknown;
      endsAt?: unknown;
      note?: unknown;
    }>(request);
    const facility = FACILITIES.find((f) => f.id === body?.facilityId);
    const unit = auth.account.units.find((u) => u.unitId === body?.unitId);
    if (!facility || !unit) return problem(op, "http.not_found");
    const start = typeof body?.startsAt === "string" ? Date.parse(body.startsAt) : NaN;
    const end = typeof body?.endsAt === "string" ? Date.parse(body.endsAt) : NaN;
    const policy = facility.bookingPolicy;
    const slot = (policy.slotMinutes ?? 60) * 60_000;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return problem(op, "validation.failed");
    const localStart = new Date(start + 7 * HOUR);
    const minuteOfDay = localStart.getUTCHours() * 60 + localStart.getUTCMinutes();
    const duration = end - start;
    if (
      duration % slot !== 0 ||
      duration > (policy.maxDurationMinutes ?? 120) * 60_000 ||
      minuteOfDay < minutesOf(policy.openFrom ?? "08:00") ||
      minuteOfDay + duration / 60_000 > minutesOf(policy.openTo ?? "22:00") ||
      start < Date.now() ||
      start > Date.now() + (policy.maxAdvanceDays ?? 14) * DAY
    ) {
      return problem(op, "validation.failed");
    }
    const community = communityOf(auth.account);
    if (
      community.bookings.some(
        (b) => b.facilityId === facility.id && live(b) && Date.parse(b.startsAt) < end && Date.parse(b.endsAt) > start,
      )
    ) {
      return problem(op, "facility.slot_taken");
    }
    const week = Math.floor((start + 7 * HOUR - 4 * DAY) / (7 * DAY));
    const thisWeek = community.bookings.filter(
      (b) =>
        b.unitId === unit.unitId &&
        b.facilityId === facility.id &&
        live(b) &&
        Math.floor((Date.parse(b.startsAt) + 7 * HOUR - 4 * DAY) / (7 * DAY)) === week,
    );
    if (thisWeek.length >= (policy.maxPerUnitPerWeek ?? 2)) return problem(op, "facility.quota_exceeded");
    const booking: Schemas["BookingDto"] = {
      id: crypto.randomUUID(),
      facilityId: facility.id,
      facilityName: facility.name,
      unitId: unit.unitId,
      unitNo: unit.unitNo,
      startsAt: bangkokIso(start),
      endsAt: bangkokIso(end),
      status: policy.requiresApproval ? "requested" : "confirmed",
      note: typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null,
      cancelReason: null,
    };
    community.bookings.push(booking);
    emit(auth.account.userId, "facility_booking.changed", { bookingId: booking.id });
    return HttpResponse.json(booking, { status: 201 });
  }),

  http.post(mswPath("/v1/resident/facility-bookings/:bookingId/actions/cancel"), async ({ request, params }) => {
    const op = "resident.community.cancelBooking";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const mine = new Set(auth.account.units.map((u) => u.unitId));
    const booking = communityOf(auth.account).bookings.find((b) => b.id === params.bookingId && mine.has(b.unitId));
    if (!booking) return problem(op, "http.not_found");
    if (!live(booking)) return problem(op, "facility.booking_invalid_state");
    const body = await json<{ reason?: unknown }>(request);
    booking.status = "cancelled";
    booking.cancelReason = typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
    emit(auth.account.userId, "facility_booking.changed", { bookingId: booking.id });
    return HttpResponse.json(booking);
  }),

  // ── building rules, contacts ──────────────────────────────────────────────────────────────────
  http.get(mswPath("/v1/resident/building-rules"), ({ request }) => {
    const op = "resident.community.rules";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unitId = new URL(request.url).searchParams.get("unitId");
    if (!auth.account.units.some((u) => u.unitId === unitId)) return problem(op, "http.not_found");
    return HttpResponse.json(rulesView(communityOf(auth.account), languageOf(request)));
  }),

  http.post(mswPath("/v1/resident/building-rules/actions/acknowledge"), async ({ request }) => {
    const op = "resident.community.acknowledgeRules";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const body = await json<{ unitId?: unknown }>(request);
    if (!auth.account.units.some((u) => u.unitId === body?.unitId)) return problem(op, "http.not_found");
    const community = communityOf(auth.account);
    community.rulesAcknowledgedAt ??= bangkokIso(Date.now());
    return HttpResponse.json(rulesView(community, languageOf(request)));
  }),

  http.get(mswPath("/v1/resident/contacts"), ({ request }) => {
    const op = "resident.community.contacts";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unitId = new URL(request.url).searchParams.get("unitId");
    const unit = auth.account.units.find((u) => u.unitId === unitId);
    if (!unit) return problem(op, "http.not_found");
    return HttpResponse.json({ data: CONTACTS.filter((c) => !c.buildingId || c.buildingId === unit.buildingId) });
  }),

  // ── access: my codes and my unit's unlock log ────────────────────────────────────────────────
  http.get(mswPath("/v1/resident/access/credentials"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.access.credentials");
    if (auth instanceof Response) return auth;
    const community = communityOf(auth.account);
    return HttpResponse.json({
      data: community.credentials,
      // CONTRACT-REQUEST #26 — whether I may create visitor codes, and for how long.
      visitorPolicy: { allowed: community.visitorAllowed && community.credentials.length > 0, maxHours: 24 },
    });
  }),

  http.get(mswPath("/v1/resident/access/events"), ({ request }) => {
    const op = "resident.access.events";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const unitId = url.searchParams.get("unitId");
    if (!auth.account.units.some((u) => u.unitId === unitId)) return problem(op, "http.not_found");
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") ?? 100)));
    const data = communityOf(auth.account)
      .events.filter((e) => e.unitId === unitId)
      .sort((a, b) => b.time.localeCompare(a.time))
      .slice(0, limit);
    return HttpResponse.json({ data });
  }),
];
