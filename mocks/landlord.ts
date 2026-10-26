/**
 * The landlord's quick actions in the mock API (L5 5.3, D-251). `POST /v1/auth/operator/identity` with a fake LINE id
 * token signs in an operator when the LINE subject says so:
 *
 *   `…landlord…`   a landlord whose LINE is linked (tenant type `landlord`)
 *   `…apartment…`  an apartment operator whose LINE is linked (the quick actions point to the web console)
 *   anything else  `auth.identity_not_linked` (link LINE in the web console first)
 *
 * Each landlord account has its own day: two open enquiries (one waiting for a reply, with a requested viewing), money
 * in this week, one overdue invoice and a lease ending — and the actions change it (reply, confirm / decline a
 * viewing, send a reminder).
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { readFakeLineIdToken } from "../src/lib/liff/fakeLineToken";
import { example, mswPath, problem } from "./contract";
import { authenticate, tokenPair } from "./handlers";
import { accountFor, openSession, type MockAccount } from "./state";
import { bangkokIso } from "./tokens";

type Schemas = components["schemas"];

export const LANDLORD_TENANT_ID = "6c000000-0000-4000-8000-0000000000a1";
const APARTMENT_TENANT_ID = "6c000000-0000-4000-8000-0000000000a2";
export const LANDLORD_LEAD_ID = "6c000000-0000-4000-8000-000000000101";
const ANSWERED_LEAD_ID = "6c000000-0000-4000-8000-000000000102";
export const LANDLORD_VIEWING_ID = "6c000000-0000-4000-8000-000000000201";
export const LANDLORD_OVERDUE_ID = "6c000000-0000-4000-8000-000000000301";

interface LandlordDay {
  leads: Schemas["OwnerLeadDto"][];
  payments: Schemas["PaymentDto"][];
  overdue: Schemas["InvoiceSummaryDto"][];
  ending: Schemas["LeaseDto"][];
  reminded: Set<string>;
}

/** On `globalThis` like the rest of the mock state: Next bundles the BFF and the pages separately. */
const holder = globalThis as typeof globalThis & { __gpMockLandlords?: Map<string, LandlordDay> };
const days = (holder.__gpMockLandlords ??= new Map<string, LandlordDay>());

const HOUR = 3_600_000;

function seedDay(): LandlordDay {
  const now = Date.now();
  const listing = {
    id: "6c000000-0000-4000-8000-000000000401",
    slug: "condo-ari-1br",
    title: "คอนโด อารีย์ 1 ห้องนอน",
    unitId: "6c000000-0000-4000-8000-000000000501",
  };
  const lead = (id: string, name: string, awaiting: boolean, minutesAgo: number): Schemas["OwnerLeadDto"] => ({
    ...example<Schemas["OwnerLeadDto"]>("owner.leads.get"),
    id,
    listing,
    prospect: { name, phone: null, partyId: `${id.slice(0, -3)}f01`, lineLinked: true },
    state: awaiting ? "new" : "contacted",
    awaitingReply: awaiting,
    lastMessage: awaiting ? "ยังว่างไหมครับ อยากดูห้องเสาร์นี้" : "ได้ค่ะ แล้วพบกันนะคะ",
    lastMessageBy: awaiting ? "prospect" : "owner",
    lastProspectAt: bangkokIso(now - minutesAgo * 60_000),
    lastOwnerAt: awaiting ? null : bangkokIso(now - 30 * 60_000),
    createdAt: bangkokIso(now - 26 * HOUR),
    moveInDate: "2026-12-01",
    termMonths: 12,
    occupants: 2,
    nationality: null,
    notes: null,
    lostReason: null,
    lostNote: null,
    leaseId: null,
    nextViewing: null,
    messages: [
      {
        id: `${id.slice(0, -3)}a01`,
        author: "prospect",
        body: "ยังว่างไหมครับ อยากดูห้องเสาร์นี้",
        createdAt: bangkokIso(now - minutesAgo * 60_000),
      },
      ...(awaiting
        ? []
        : [
            {
              id: `${id.slice(0, -3)}a02`,
              author: "owner" as const,
              body: "ได้ค่ะ แล้วพบกันนะคะ",
              createdAt: bangkokIso(now - 30 * 60_000),
            },
          ]),
    ],
    viewings: [],
    version: 1,
  });
  const waiting = lead(LANDLORD_LEAD_ID, "Daniel K.", true, 45);
  waiting.viewings = [
    {
      id: LANDLORD_VIEWING_ID,
      startsAt: bangkokIso(now + 48 * HOUR),
      endsAt: bangkokIso(now + 48.5 * HOUR),
      state: "requested",
      note: null,
      reason: null,
      rescheduledTo: null,
      cancelledBy: null,
    },
  ];
  waiting.nextViewing = waiting.viewings[0]!;
  const payment = example<{ data: Schemas["PaymentDto"][] }>("owner.payments.list").data[0]!;
  const invoice = example<{ data: Schemas["InvoiceSummaryDto"][] }>("owner.invoices.list").data[0]!;
  const lease = example<{ data: Schemas["LeaseDto"][] }>("owner.leases.list").data[0]!;
  return {
    leads: [waiting, lead(ANSWERED_LEAD_ID, "มาลี ส.", false, 300)],
    payments: [
      {
        ...payment,
        id: "6c000000-0000-4000-8000-000000000601",
        amount: "15000.00",
        payerName: "สมหญิง ใจดี",
        unitNo: "99/1",
        paidAt: bangkokIso(now - 20 * HOUR),
        status: "confirmed",
      },
    ],
    overdue: [
      {
        ...invoice,
        id: LANDLORD_OVERDUE_ID,
        number: "INV-2569-00031",
        unitNo: "88/12",
        billedPartyName: "Ben Example",
        balance: "18000.00",
        dueDate: "2026-10-05",
        status: "overdue",
      },
    ],
    ending: [
      {
        ...lease,
        id: "6c000000-0000-4000-8000-000000000701",
        unitNo: "77/3",
        lesseeName: "วิชัย ม.",
        endDate: "2026-12-31",
        status: "notice_given",
      },
    ],
    reminded: new Set(),
  };
}

function dayOf(account: MockAccount): LandlordDay {
  let day = days.get(account.userId);
  if (!day) {
    day = seedDay();
    days.set(account.userId, day);
  }
  return day;
}

/** An operator call of a landlord: the operator audience and the session's tenant as `X-Tenant-Id`. */
function operator(request: Request, op: string) {
  const auth = authenticate(request, "operator", op);
  if (auth instanceof Response) return auth;
  const tenantId = request.headers.get("x-tenant-id");
  const own = auth.account.subject.includes("apartment") ? APARTMENT_TENANT_ID : LANDLORD_TENANT_ID;
  if (!tenantId) return problem(op, "tenant.context_required");
  if (tenantId !== own) return problem(op, "tenant.not_in_scope");
  return { account: auth.account, day: dayOf(auth.account) };
}

async function json<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function summary(lead: Schemas["OwnerLeadDto"]): Schemas["OwnerLeadSummaryDto"] {
  const {
    id,
    listing,
    prospect,
    state,
    lastMessage,
    channel,
    lastMessageBy,
    awaitingReply,
    nextViewing,
    lastProspectAt,
    lastOwnerAt,
    createdAt,
  } = lead;
  return {
    id,
    listing,
    prospect,
    state,
    lastMessage,
    channel,
    lastMessageBy,
    awaitingReply,
    nextViewing,
    lastProspectAt,
    lastOwnerAt,
    createdAt,
  };
}

function viewingDecision(action: "confirm" | "decline") {
  const op = action === "confirm" ? "owner.listingViewings.confirm" : "owner.listingViewings.decline";
  return http.post(mswPath(`/v1/owner/listing-viewings/:viewingId/actions/${action}`), async ({ request, params }) => {
    const ok = operator(request, op);
    if (ok instanceof Response) return ok;
    const lead = ok.day.leads.find((l) => l.viewings.some((v) => v.id === params.viewingId));
    const viewing = lead?.viewings.find((v) => v.id === params.viewingId);
    if (!lead || !viewing) return problem(op, "http.not_found");
    if (action === "decline") {
      const body = await json<{ reason?: unknown }>(request);
      if (typeof body?.reason !== "string" || !body.reason.trim()) return problem(op, "validation.failed");
      viewing.reason = body.reason.trim();
    }
    viewing.state = action === "confirm" ? "confirmed" : "declined";
    if (action === "confirm") lead.state = "viewing_booked";
    return HttpResponse.json({ ...viewing, endsAt: viewing.endsAt });
  });
}

export const landlordHandlers: HttpHandler[] = [
  http.post(mswPath("/v1/auth/operator/identity"), async ({ request }) => {
    const op = "auth.operatorIdentity.exchange";
    const body = await json<{ provider?: unknown; idToken?: unknown }>(request);
    if (!body || body.provider !== "line" || typeof body.idToken !== "string") return problem(op, "validation.failed");
    const claims = readFakeLineIdToken(body.idToken);
    if (!claims) return problem(op, "auth.identity_token_invalid");
    const sub = claims.sub.toLowerCase();
    if (!sub.includes("landlord") && !sub.includes("apartment")) return problem(op, "auth.identity_not_linked");
    const account = accountFor(`operator-line:${claims.sub}`, {
      displayName: claims.name ?? "สมใจ มีบ้าน",
      phone: null,
      lineLinked: true,
    });
    const session = openSession("operator", account.userId);
    session.scopes = [`tenant:${sub.includes("apartment") ? APARTMENT_TENANT_ID : LANDLORD_TENANT_ID}`];
    const pair = tokenPair(session, account);
    return HttpResponse.json({ ...pair, subject: { ...pair.subject, roles: ["owner"], permissions: [] } });
  }),

  http.get(mswPath("/v1/owner/me"), ({ request }) => {
    const op = "owner.me.get";
    const ok = operator(request, op);
    if (ok instanceof Response) return ok;
    const base = example<Schemas["OperatorMeDto"]>(op);
    const apartment = ok.account.subject.includes("apartment");
    const tenant = {
      id: apartment ? APARTMENT_TENANT_ID : LANDLORD_TENANT_ID,
      displayName: apartment ? "หอพักสุขใจ" : "สมใจ มีบ้าน",
      type: apartment ? ("apartment" as const) : ("landlord" as const),
      role: "owner" as const,
      status: "active" as const,
    };
    return HttpResponse.json({
      ...base,
      user: { ...base.user, id: ok.account.userId, displayName: ok.account.displayName, lineLinked: true },
      tenants: [tenant],
      currentTenant: { ...tenant, buildingIds: [] },
    });
  }),

  http.get(mswPath("/v1/owner/leads"), ({ request }) => {
    const ok = operator(request, "owner.leads.list");
    if (ok instanceof Response) return ok;
    const open = new URL(request.url).searchParams.get("open") === "true";
    return HttpResponse.json(ok.day.leads.filter((l) => !open || !["won", "lost"].includes(l.state)).map(summary));
  }),

  http.get(mswPath("/v1/owner/leads/:leadId"), ({ request, params }) => {
    const op = "owner.leads.get";
    const ok = operator(request, op);
    if (ok instanceof Response) return ok;
    const lead = ok.day.leads.find((l) => l.id === params.leadId);
    return lead ? HttpResponse.json(lead) : problem(op, "http.not_found");
  }),

  http.post(mswPath("/v1/owner/leads/:leadId/messages"), async ({ request, params }) => {
    const op = "owner.leads.reply";
    const ok = operator(request, op);
    if (ok instanceof Response) return ok;
    const lead = ok.day.leads.find((l) => l.id === params.leadId);
    if (!lead) return problem(op, "http.not_found");
    const body = await json<{ body?: unknown }>(request);
    if (typeof body?.body !== "string" || !body.body.trim() || body.body.length > 2000)
      return problem(op, "validation.failed");
    const message = {
      id: crypto.randomUUID(),
      author: "owner" as const,
      body: body.body.trim(),
      createdAt: bangkokIso(Date.now()),
    };
    lead.messages.push(message);
    Object.assign(lead, {
      awaitingReply: false,
      lastMessage: message.body,
      lastMessageBy: "owner",
      lastOwnerAt: message.createdAt,
      state: lead.state === "new" ? "contacted" : lead.state,
    });
    return HttpResponse.json(message, { status: 201 });
  }),

  http.get(mswPath("/v1/owner/listing-viewings"), ({ request }) => {
    const ok = operator(request, "owner.listingViewings.list");
    if (ok instanceof Response) return ok;
    return HttpResponse.json(
      ok.day.leads.flatMap((lead) =>
        lead.viewings.map((v) => ({
          id: v.id,
          leadId: lead.id,
          listing: { id: lead.listing.id, slug: lead.listing.slug, title: lead.listing.title },
          prospectName: lead.prospect.name,
          startsAt: v.startsAt,
          endsAt: v.endsAt,
          state: v.state,
        })),
      ),
    );
  }),
  viewingDecision("confirm"),
  viewingDecision("decline"),

  http.get(mswPath("/v1/owner/payments"), ({ request }) => {
    const ok = operator(request, "owner.payments.list");
    if (ok instanceof Response) return ok;
    return HttpResponse.json({ data: ok.day.payments, meta: { page: 1, perPage: 20, total: ok.day.payments.length } });
  }),

  http.get(mswPath("/v1/owner/invoices"), ({ request }) => {
    const ok = operator(request, "owner.invoices.list");
    if (ok instanceof Response) return ok;
    return HttpResponse.json({ data: ok.day.overdue, meta: { page: 1, perPage: 20, total: ok.day.overdue.length } });
  }),

  http.post(mswPath("/v1/owner/invoices/:invoiceId/actions/send-reminder"), ({ request, params }) => {
    const op = "owner.invoices.sendReminder";
    const ok = operator(request, op);
    if (ok instanceof Response) return ok;
    const invoice = ok.day.overdue.find((i) => i.id === params.invoiceId);
    if (!invoice) return problem(op, "http.not_found");
    if (!request.headers.get("idempotency-key")) return problem(op, "idempotency.key_required");
    ok.day.reminded.add(invoice.id);
    return HttpResponse.json(example(op));
  }),

  http.get(mswPath("/v1/owner/leases"), ({ request }) => {
    const ok = operator(request, "owner.leases.list");
    if (ok instanceof Response) return ok;
    const status = new URL(request.url).searchParams.get("status");
    const rows = ok.day.ending.filter((l) => !status || l.status === status);
    return HttpResponse.json({ data: rows, meta: { page: 1, perPage: 20, total: rows.length } });
  }),
];
