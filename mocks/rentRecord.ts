/**
 * The portable rent record (D-256, api B7.11) for residents and prospects — one record per account (the same LINE
 * account is one person in both audiences): eleven confirmed months, one late. Shares are kept per account: with an
 * enquiry (`POST /v1/prospect/enquiries/{leadId}/rent-record`) or as a letter whose code is shown once. The
 * `gp_mock` cookie `rent_record.none=1` makes the record empty (`rent_record.empty` on sharing).
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { mswPath, problem } from "./contract";
import { authenticate } from "./handlers";
import { enquiryOf } from "./prospect";

type Schemas = components["schemas"];
type Share = Schemas["RentRecordShareDto"];
type Audience = "resident" | "prospect";

const holder = globalThis as typeof globalThis & { __gpMockRentRecord?: Map<string, Share[]> };
holder.__gpMockRentRecord ??= new Map();
const byUser = holder.__gpMockRentRecord;

const MONTHS = [
  "2026-09",
  "2026-08",
  "2026-07",
  "2026-06",
  "2026-05",
  "2026-04",
  "2026-03",
  "2026-02",
  "2026-01",
  "2025-12",
  "2025-11",
];

const RECORD: Schemas["RentRecordDto"] = {
  months: MONTHS.map((month) => ({ month, status: month === "2026-03" ? ("late" as const) : ("on_time" as const) })),
  onTime: 10,
  late: 1,
  outstanding: 0,
  notConfirmed: 0,
  firstMonth: "2025-11",
  lastMonth: "2026-09",
};
const EMPTY: Schemas["RentRecordDto"] = {
  months: [],
  onTime: 0,
  late: 0,
  outstanding: 0,
  notConfirmed: 0,
  firstMonth: null,
  lastMonth: null,
};

function hasRecord(request: Request): boolean {
  return !(request.headers.get("x-gp-mock") ?? "").split(";").some((pair) => pair.trim() === "rent_record.none=1");
}

const sharesOf = (userId: string) => {
  const list = byUser.get(userId) ?? [];
  byUser.set(userId, list);
  return list;
};

const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const newCode = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");

function handlers(audience: Audience): HttpHandler[] {
  const base = `/v1/${audience}/me/rent-record`;
  return [
    http.get(mswPath(base), ({ request }) => {
      const auth = authenticate(request, audience, `${audience}.rentRecord.get`);
      if (auth instanceof Response) return auth;
      return HttpResponse.json({
        record: hasRecord(request) ? RECORD : EMPTY,
        shares: sharesOf(auth.account.userId),
      } satisfies Schemas["MyRentRecordDto"]);
    }),
    http.post(mswPath(`${base}/letters`), ({ request }) => {
      const op = `${audience}.rentRecord.createLetter`;
      const auth = authenticate(request, audience, op);
      if (auth instanceof Response) return auth;
      if (!hasRecord(request)) return problem(op, "rent_record.empty");
      const code = newCode();
      const share: Share = {
        id: crypto.randomUUID(),
        kind: "letter",
        state: "live",
        lead: null,
        codeHint: code.slice(-4),
        expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString(),
        createdAt: new Date().toISOString(),
        revokedAt: null,
      };
      sharesOf(auth.account.userId).unshift(share);
      return HttpResponse.json(
        {
          share,
          code,
          verifyUrl: `https://getproperty.co/rent-record/${code}`,
        } satisfies Schemas["RentRecordLetterDto"],
        { status: 201 },
      );
    }),
    http.post(mswPath(`${base}/shares/{shareId}/actions/revoke`), ({ request, params }) => {
      const op = `${audience}.rentRecord.revokeShare`;
      const auth = authenticate(request, audience, op);
      if (auth instanceof Response) return auth;
      const share = sharesOf(auth.account.userId).find((s) => s.id === params.shareId);
      if (!share) return problem(op, "http.not_found");
      if (share.state === "live") {
        share.state = "revoked";
        share.revokedAt = new Date().toISOString();
      }
      return HttpResponse.json(share);
    }),
  ];
}

export const rentRecordHandlers: HttpHandler[] = [
  ...handlers("resident"),
  ...handlers("prospect"),
  http.post(mswPath("/v1/prospect/enquiries/{leadId}/rent-record"), ({ request, params }) => {
    const op = "prospect.rentRecord.shareWithEnquiry";
    const auth = authenticate(request, "prospect", op);
    if (auth instanceof Response) return auth;
    const enquiry = enquiryOf(auth.account.userId, String(params.leadId));
    if (!enquiry) return problem(op, "http.not_found");
    if (!hasRecord(request)) return problem(op, "rent_record.empty");
    const shares = sharesOf(auth.account.userId);
    const live = shares.find((s) => s.lead?.id === enquiry.id && s.state === "live");
    if (live) return HttpResponse.json(live);
    const share: Share = {
      id: crypto.randomUUID(),
      kind: "enquiry",
      state: "live",
      lead: { id: enquiry.id, listingTitle: enquiry.listing.titleTh, ownerName: enquiry.listing.ownerName },
      codeHint: null,
      expiresAt: null,
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };
    shares.unshift(share);
    return HttpResponse.json(share);
  }),
];
