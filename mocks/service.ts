/**
 * Service requests (resident) and work orders (technician) in the mock API — B5.1, D-072, D-210. Shapes are the
 * contract's (`ResidentServiceRequestDto`, `TechnicianWorkOrderDto`, examples deep-copied); the workflow follows the
 * API's rules (`src/modules/ops-service/service-rules.ts` in getproperty-api): a resident cancels while `new` /
 * `triaged` and rates once `done` (the rating closes it); the assignee accepts, checks in, waits for parts and
 * resumes, adds cost lines and completes with at least one after photo (422 `work_order.photo_required`).
 *
 * Scenario words in the fake LINE subject pick the starting state:
 *
 *   (resident, default)  three requests of A-201: one in progress (a visit planned), one done waiting for my rating,
 *                         one closed with my rating
 *   …norequests…          none
 *   …warranty…            a new request lands `inWarranty` (referred to the developer, D-153)
 *   (technician) …tech…   two work orders assigned to me (today and tomorrow) on another resident's requests
 *
 * Requests carry their photo links (`url: null` for a file not yet uploaded — the API's "not scanned clean"), status
 * history, SLA (`paused` while referred to the warranty, `breached` kept, `none` once done), preferred visit and
 * visit confirmation (D-218, getproperty-api `slaView` / `visitConfirmation`); one thread per request shared by the
 * resident, the office and the technician (`service_request.message` down the realtime stream).
 *
 * Mock-only controls (never in the contract, never in a real build): `POST /v1/resident/__mock/service-requests/{id}/assign
 * { technician: "<LINE sub>" }` plays the owner — triage + a work order assigned to that technician (L4 e2e);
 * `…/reschedule { hours }` moves the planned visit (the confirmation is asked again); `…/office-message { body }`
 * is the office writing on the thread.
 */
import { createHash } from "node:crypto";

import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { example, mswPath, problem } from "./contract";
import { emit } from "./events";
import { authenticate, unmatchedPhone } from "./handlers";
import { accountFor, occupancyStart, UNIT_A, UNIT_B, type MockAccount } from "./state";
import { bangkokIso } from "./tokens";
import { mockPhoto, presign, uploadedBy, uploads, validPresign } from "./uploads";

type Schemas = components["schemas"];
type Request_ = Schemas["ResidentServiceRequestDto"];
type WorkOrder = Schemas["TechnicianWorkOrderDto"];
type Status = Schemas["ServiceRequestStatus"];
type Author = Schemas["ServiceMessageAuthor"];

interface MockMessage {
  id: string;
  authorUserId: string | null;
  author: Author;
  authorName: string;
  body: string;
  at: string;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** The platform's default categories (getproperty-api `DEFAULT_SERVICE_CATEGORIES`, D-072). */
export const CATEGORIES = [
  { key: "electrical", nameTh: "ไฟฟ้า", nameEn: "Electrical", slaHours: 24 },
  { key: "plumbing", nameTh: "ประปา", nameEn: "Plumbing", slaHours: 24 },
  { key: "aircon", nameTh: "เครื่องปรับอากาศ", nameEn: "Air conditioning", slaHours: 48 },
  { key: "appliance", nameTh: "เครื่องใช้ไฟฟ้า", nameEn: "Appliance", slaHours: 72 },
  { key: "structure", nameTh: "โครงสร้าง ประตู หน้าต่าง", nameEn: "Structure", slaHours: 120 },
  { key: "pest", nameTh: "แมลงและสัตว์รบกวน", nameEn: "Pest control", slaHours: 72 },
  { key: "cleaning", nameTh: "ทำความสะอาด", nameEn: "Cleaning", slaHours: 48 },
  { key: "other", nameTh: "อื่น ๆ", nameEn: "Other", slaHours: 72 },
] as const;

function uuidFrom(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function categoryId(tenantId: string, key: string): string {
  return uuidFrom(`category#${tenantId}#${key}`);
}

function categoriesOf(tenantId: string): Schemas["ServiceCategoryDto"][] {
  return CATEGORIES.map((c, index) => ({
    id: categoryId(tenantId, c.key),
    key: c.key,
    nameTh: c.nameTh,
    nameEn: c.nameEn,
    slaHours: c.slaHours,
    sortOrder: index + 1,
    isActive: true,
    source: "platform",
  }));
}

/** A request with what only the mock engine keeps (workflow history, photos, thread, the rater). */
export interface MockRequest {
  dto: Request_;
  residentUserId: string;
  /**
   * The login whose unit history a seeded request belongs to (D-224 in the mock: every mock account occupies the
   * same example units, so unit-wide visibility is limited to the household it was seeded for).
   */
  seededFor?: string;
  tenantId: string;
  buildingId: string;
  buildingName: string;
  events: { status: Status; at: string }[];
  slaHours: number;
  /** When the resident confirmed, and the visit start they confirmed (a moved visit asks again). */
  visitConfirmed: { at: string; for: string } | null;
  slaBreached: boolean;
  messages: MockMessage[];
}

export interface MockWorkOrder {
  dto: WorkOrder;
  assigneeUserId: string;
  waitingParts: boolean;
  /** The office ↔ technician thread of a work order without a request. */
  messages: MockMessage[];
}

interface ServiceStore {
  requests: Map<string, MockRequest>;
  workOrders: Map<string, MockWorkOrder>;
  seeded: Set<string>;
  replays: Map<string, { status: number; body: unknown }>;
}
const holder = globalThis as typeof globalThis & { __gpMockService?: ServiceStore };
holder.__gpMockService ??= { requests: new Map(), workOrders: new Map(), seeded: new Set(), replays: new Map() };
export const service = holder.__gpMockService;

let refSeq = 0;

function residentActions(status: Status, rated: boolean): string[] {
  if (status === "new" || status === "triaged") return ["cancel"];
  if (status === "done" && !rated) return ["rate"];
  return [];
}

function setStatus(request: MockRequest, status: Status, at = Date.now()): void {
  request.dto.status = status;
  request.events.push({ status, at: bangkokIso(at) });
  if (status === "done") request.dto.doneAt = bangkokIso(at);
  if (status === "closed" || status === "cancelled") request.dto.closedAt = bangkokIso(at);
  request.dto.nextActions = residentActions(status, request.dto.rating !== null);
  emit(request.residentUserId, "service_request.changed", { serviceRequestId: request.dto.id });
}

/**
 * Seeded requests and work orders have ids derived from the account's subject and a slot (`open`, `leak` …), so a
 * measured URL is stable (lighthouse/resident.json, technician.json; mocks.test.ts checks them).
 */
export function mockSeedId(subject: string, kind: "request" | "work-order", slot: string): string {
  const hex = createHash("sha256").update(`${subject}#${kind}#${slot}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function newRequest(
  account: MockAccount,
  unit: typeof UNIT_A,
  fields: {
    categoryKey: string;
    description: string;
    priority: Schemas["ServicePriority"];
    photoIds: string[];
    preferredVisit?: Schemas["VisitPreference"] | null;
  },
  at: number,
  id: string = crypto.randomUUID(),
): MockRequest {
  const cat = CATEGORIES.find((c) => c.key === fields.categoryKey) ?? CATEGORIES[7];
  refSeq += 1;
  const request: MockRequest = {
    residentUserId: account.userId,
    tenantId: unit.tenantId,
    buildingId: unit.buildingId,
    buildingName: unit.buildingName,
    events: [{ status: "new", at: bangkokIso(at) }],
    slaHours: cat.slaHours,
    visitConfirmed: null,
    slaBreached: false,
    messages: [],
    dto: {
      ...example<Request_>("resident.serviceRequests.get"),
      id,
      ref: `SR-${String(1000 + refSeq)}`,
      category: { id: categoryId(unit.tenantId, cat.key), key: cat.key, nameTh: cat.nameTh, nameEn: cat.nameEn },
      description: fields.description,
      priority: fields.priority,
      photoIds: fields.photoIds,
      photos: [],
      events: [],
      sla: null,
      preferredVisit: fields.preferredVisit ?? null,
      visitConfirmedAt: null,
      status: "new",
      createdAt: bangkokIso(at),
      doneAt: null,
      closedAt: null,
      visitAt: null,
      rating: null,
      ratingComment: null,
      inWarranty: false,
      unitId: unit.unitId,
      unitNo: unit.unitNo,
      nextActions: ["cancel"],
    },
  };
  service.requests.set(id, request);
  return request;
}

function technicianName(account: MockAccount): string {
  return account.displayName || "ช่าง";
}

/** The owner's side, played by the mock: triage, a work order, assigned to the technician (D-072). */
export function assignToTechnician(
  request: MockRequest,
  technician: MockAccount,
  scheduledAt: number,
  now = Date.now(),
  id: string = crypto.randomUUID(),
): MockWorkOrder {
  if (request.dto.status === "new") setStatus(request, "triaged", now);
  const base = example<WorkOrder>("technician.workOrders.get");
  const workOrder: MockWorkOrder = {
    assigneeUserId: technician.userId,
    waitingParts: false,
    messages: [],
    dto: {
      ...base,
      id,
      title: `${request.dto.category.nameTh} — ${request.dto.unitNo ?? ""}`.trim(),
      description: request.dto.description,
      requestDescription: request.dto.description,
      requestPhotoIds: [...request.dto.photoIds],
      beforePhotoIds: [],
      afterPhotoIds: [],
      categoryKey: request.dto.category.key,
      priority: request.dto.priority,
      preferredVisit: request.dto.preferredVisit,
      photos: [],
      rating: null,
      ratingComment: null,
      status: "assigned",
      assignedAt: bangkokIso(now),
      acceptedAt: null,
      checkedInAt: null,
      completedAt: null,
      completionNote: null,
      verifiedAt: null,
      cancelledAt: null,
      cancelReason: null,
      costLines: [],
      costTotal: "0.00",
      createdAt: bangkokIso(now),
      scheduledAt: bangkokIso(scheduledAt),
      scheduledUntil: bangkokIso(scheduledAt + 4 * HOUR),
      serviceRequestId: request.dto.id,
      unitId: request.dto.unitId,
      unitNo: request.dto.unitNo,
      buildingId: request.buildingId,
      buildingName: request.buildingName,
      assignee: { id: technician.userId, displayName: technicianName(technician), type: "party" },
      nextActions: [],
      version: 1,
    },
  };
  workOrder.dto.nextActions = technicianActions(workOrder);
  service.workOrders.set(workOrder.dto.id, workOrder);
  request.dto.visitAt = plannedVisitOf(request);
  setStatus(request, "assigned", now);
  return workOrder;
}

/** The assignee's actions (getproperty-api `workOrderActions(status, "assignee", waitingParts)`). */
function technicianActions(workOrder: MockWorkOrder): string[] {
  const status = workOrder.dto.status;
  const out: string[] = [];
  if (status === "assigned") out.push("accept");
  if (status === "assigned" || status === "accepted") out.push("check-in");
  if (status === "in_progress") out.push(workOrder.waitingParts ? "resume" : "wait-parts");
  if (["assigned", "accepted", "in_progress"].includes(status) && !workOrder.waitingParts) out.push("complete");
  return out;
}

function touch(workOrder: MockWorkOrder): void {
  workOrder.dto.version += 1;
  workOrder.dto.nextActions = technicianActions(workOrder);
  const request = workOrder.dto.serviceRequestId ? service.requests.get(workOrder.dto.serviceRequestId) : undefined;
  emit(workOrder.assigneeUserId, "work_order.changed", { workOrderId: workOrder.dto.id });
  if (request) emit(request.residentUserId, "service_request.changed", { serviceRequestId: request.dto.id });
}

/** Lets the next read seed the account's requests again (a party link the Owner just confirmed, D-226). */
export function forgetServiceSeed(account: MockAccount): void {
  service.seeded.delete(account.userId);
}

function seedResident(account: MockAccount): void {
  if (service.seeded.has(account.userId)) return;
  service.seeded.add(account.userId);
  const has = (word: string) => account.subject.toLowerCase().includes(word);
  if (account.units.length === 0 || has("norequests")) return;
  const unit = account.units.some((u) => u.unitId === UNIT_A.unitId) ? UNIT_A : UNIT_B;
  const now = Date.now();
  const crew = accountFor("line:Umock-crew-somsak", { displayName: "ช่างสมศักดิ์", phone: null, lineLinked: true });

  // D-224: the unit's previous occupant reported a leak before this occupancy began — never shown to this resident.
  const former = accountFor(`line:Umock-former-of-${account.userId}`, {
    displayName: "ผู้เช่าคนก่อน",
    phone: null,
    lineLinked: true,
  });
  service.seeded.add(former.userId);
  newRequest(
    former,
    unit,
    { categoryKey: "plumbing", description: "ก๊อกน้ำห้องน้ำรั่ว (ผู้เช่าคนก่อน)", priority: "normal", photoIds: [] },
    occupancyStart(unit, now) - 30 * DAY,
    mockSeedId(account.subject, "request", "former"),
  ).seededFor = account.userId;

  const closed = newRequest(
    account,
    unit,
    { categoryKey: "electrical", description: "ปลั๊กไฟข้างเตียงไม่มีไฟ", priority: "normal", photoIds: [] },
    now - 20 * DAY,
    mockSeedId(account.subject, "request", "closed"),
  );
  assignToTechnician(closed, crew, now - 19 * DAY, now - 19 * DAY - 2 * HOUR);
  setStatus(closed, "in_progress", now - 19 * DAY + 2 * HOUR);
  setStatus(closed, "done", now - 19 * DAY + 3 * HOUR);
  closed.dto.rating = 5;
  closed.dto.ratingComment = "มาไว เรียบร้อยดี";
  setStatus(closed, "closed", now - 18 * DAY);
  for (const wo of service.workOrders.values())
    if (wo.dto.serviceRequestId === closed.dto.id) wo.dto.status = "verified";

  const done = newRequest(
    account,
    unit,
    { categoryKey: "aircon", description: "แอร์มีน้ำหยด", priority: "normal", photoIds: [] },
    now - 4 * DAY,
    mockSeedId(account.subject, "request", "done"),
  );
  assignToTechnician(done, crew, now - 3 * DAY, now - 3 * DAY - 2 * HOUR);
  setStatus(done, "in_progress", now - 3 * DAY + HOUR);
  setStatus(done, "done", now - 3 * DAY + 2 * HOUR);
  for (const wo of service.workOrders.values()) {
    if (wo.dto.serviceRequestId === done.dto.id) {
      wo.dto.status = "done";
      wo.dto.completedAt = done.dto.doneAt;
      wo.dto.completionNote = "ล้างท่อน้ำทิ้งแล้ว";
    }
  }

  const open = newRequest(
    account,
    unit,
    {
      categoryKey: "plumbing",
      description: "ก๊อกน้ำอ่างล้างหน้ารั่ว",
      priority: "normal",
      photoIds: [],
      preferredVisit: "afternoon",
    },
    now - 8 * HOUR,
    mockSeedId(account.subject, "request", "open"),
  );
  assignToTechnician(open, crew, now + 6 * HOUR, now - 7 * HOUR);
  open.messages.push({
    id: crypto.randomUUID(),
    authorUserId: null,
    author: "office",
    authorName: UNIT_A.tenantName,
    body: "รับเรื่องแล้วค่ะ ช่างจะเข้าไปตามเวลานัด",
    at: bangkokIso(now - 7 * HOUR),
  });
}

/** Two work orders for a technician account (`…tech…`), on another resident's requests. */
function seedTechnician(account: MockAccount): void {
  if (service.seeded.has(account.userId)) return;
  service.seeded.add(account.userId);
  if (!account.subject.toLowerCase().includes("tech")) return;
  const resident = accountFor(`line:Umock-resident-of-${account.userId}`, {
    displayName: "ผู้เช่า ทดสอบ",
    phone: null,
    lineLinked: true,
  });
  service.seeded.add(resident.userId);
  const now = Date.now();
  const photo = crypto.randomUUID();
  uploads.set(photo, {
    fileId: photo,
    userId: resident.userId,
    purpose: "service_request",
    ref: UNIT_A.unitId,
    role: null,
    contentType: "image/jpeg",
    sha256: "0".repeat(64),
    bytes: 3,
    done: true,
    createdAt: bangkokIso(now - DAY),
  });
  const leak = newRequest(
    resident,
    UNIT_A,
    { categoryKey: "plumbing", description: "ก๊อกน้ำอ่างล้างหน้ารั่ว น้ำหยดตลอด", priority: "high", photoIds: [photo] },
    now - DAY,
  );
  assignToTechnician(leak, account, now + 2 * HOUR, Date.now(), mockSeedId(account.subject, "work-order", "leak"));
  const light = newRequest(
    resident,
    UNIT_B,
    { categoryKey: "electrical", description: "หลอดไฟห้องน้ำขาด", priority: "normal", photoIds: [] },
    now - 2 * DAY,
  );
  const second = assignToTechnician(
    light,
    account,
    now + DAY + 3 * HOUR,
    Date.now(),
    mockSeedId(account.subject, "work-order", "light"),
  );
  second.dto.status = "accepted";
  second.dto.acceptedAt = bangkokIso(now - HOUR);
  second.dto.nextActions = technicianActions(second);
}

function workOrdersOf(request: MockRequest): MockWorkOrder[] {
  return [...service.workOrders.values()].filter((wo) => wo.dto.serviceRequestId === request.dto.id);
}

/** The planned visit: the earliest scheduled work order that is not cancelled (getproperty-api `plannedVisit`). */
function plannedVisitOf(request: MockRequest): string | null {
  const visits = workOrdersOf(request)
    .filter((wo) => wo.dto.scheduledAt && wo.dto.status !== "cancelled")
    .map((wo) => wo.dto.scheduledAt!)
    .sort((x, y) => Date.parse(x) - Date.parse(y));
  return visits[0] ?? null;
}

/** A photo link the way the API answers it: a link once the file is uploaded, `null` before (not scanned clean). */
function photoLink(role: Schemas["ServicePhotoRole"], label: string, hue: number) {
  return (id: string, index: number): Schemas["ServicePhotoDto"] => ({
    id,
    role,
    url: uploads.get(id)?.done === false ? null : mockPhoto(`${label} ${index + 1}`, hue),
  });
}

/** Whether the planned visit waits for the resident's confirmation (getproperty-api `visitConfirmation`). */
function visitOf(request: MockRequest): { confirmedAt: string | null; due: boolean } {
  const visitAt = plannedVisitOf(request);
  const visit = workOrdersOf(request).find((wo) => wo.dto.scheduledAt === visitAt && wo.dto.status !== "cancelled");
  const confirmedAt =
    visitAt && request.visitConfirmed && Date.parse(request.visitConfirmed.for) === Date.parse(visitAt)
      ? request.visitConfirmed.at
      : null;
  return { confirmedAt, due: !!visit && !confirmedAt && ["assigned", "accepted"].includes(visit.dto.status) };
}

/** The SLA as the resident sees it (getproperty-api `slaView`). */
function slaOf(request: MockRequest, now = Date.now()): Schemas["ServiceSlaDto"] {
  const dueAt = Date.parse(request.dto.createdAt) + request.slaHours * HOUR;
  if (request.slaBreached) return { dueAt: bangkokIso(dueAt), state: "breached" };
  if (request.dto.inWarranty && isOpen(request.dto.status)) return { dueAt: null, state: "paused" };
  if (!isOpen(request.dto.status)) return { dueAt: null, state: "none" };
  if (dueAt <= now) {
    request.slaBreached = true;
    return { dueAt: bangkokIso(dueAt), state: "breached" };
  }
  return { dueAt: bangkokIso(dueAt), state: dueAt - now <= 2 * HOUR ? "at_risk" : "on_track" };
}

function isOpen(status: Status): boolean {
  return ["new", "triaged", "assigned", "in_progress", "waiting_parts"].includes(status);
}

/** `ResidentServiceRequestDto` as every resident answer carries it (list, get, create, cancel, rate, confirm-visit). */
export function requestDto(request: MockRequest): Request_ {
  const workOrders = workOrdersOf(request).filter((wo) => wo.dto.status !== "cancelled");
  const visit = visitOf(request);
  return {
    ...request.dto,
    nextActions: visit.due ? [...request.dto.nextActions, "confirm-visit"] : [...request.dto.nextActions],
    photos: [
      ...request.dto.photoIds.map(photoLink("report", "แจ้งซ่อม", 200)),
      ...workOrders.flatMap((wo) => wo.dto.beforePhotoIds.map(photoLink("before", "ก่อนซ่อม", 30))),
      ...workOrders.flatMap((wo) => wo.dto.afterPhotoIds.map(photoLink("after", "หลังซ่อม", 140))),
    ],
    events: [...request.events],
    sla: slaOf(request),
    visitAt: plannedVisitOf(request),
    visitConfirmedAt: visit.confirmedAt,
  };
}

/** `TechnicianWorkOrderDto` with the request's report photos, its own before / after, the rating once given. */
export function workOrderDto(workOrder: MockWorkOrder): WorkOrder {
  const request = requestOf(workOrder);
  return {
    ...workOrder.dto,
    photos: [
      ...workOrder.dto.requestPhotoIds.map(photoLink("report", "แจ้งซ่อม", 200)),
      ...workOrder.dto.beforePhotoIds.map(photoLink("before", "ก่อนซ่อม", 30)),
      ...workOrder.dto.afterPhotoIds.map(photoLink("after", "หลังซ่อม", 140)),
    ],
    preferredVisit: request?.dto.preferredVisit ?? null,
    rating: request?.dto.rating ?? null,
    ratingComment: request?.dto.ratingComment ?? null,
  };
}

/** The thread of a work order: its request's (shared by the three parties), or its own with the office. */
function threadOf(workOrder: MockWorkOrder): MockMessage[] {
  return requestOf(workOrder)?.messages ?? workOrder.messages;
}

function messageDto(m: MockMessage, userId: string): Schemas["ServiceMessageDto"] {
  return {
    id: m.id,
    author: m.author,
    authorName: m.authorName,
    body: m.body,
    createdAt: m.at,
    mine: m.authorUserId === userId,
  };
}

/** Appends a message and tells everyone on the thread in realtime (`service_request.message`, D-218). */
function postMessage(
  thread: MockMessage[],
  author: { userId: string | null; kind: Author; name: string },
  body: string,
  notify: {
    residentUserId?: string;
    technicianUserIds: string[];
    serviceRequestId: string | null;
    workOrderId?: string;
  },
): MockMessage {
  const message: MockMessage = {
    id: crypto.randomUUID(),
    authorUserId: author.userId,
    author: author.kind,
    authorName: author.name,
    body,
    at: bangkokIso(Date.now()),
  };
  thread.push(message);
  const payload: Record<string, string> = { messageId: message.id };
  if (notify.serviceRequestId) payload.serviceRequestId = notify.serviceRequestId;
  if (notify.workOrderId) payload.workOrderId = notify.workOrderId;
  if (notify.residentUserId) emit(notify.residentUserId, "service_request.message", payload);
  for (const userId of notify.technicianUserIds) emit(userId, "service_request.message", payload);
  return message;
}

function notifyOf(request: MockRequest) {
  return {
    residentUserId: request.residentUserId,
    technicianUserIds: workOrdersOf(request).map((wo) => wo.assigneeUserId),
    serviceRequestId: request.dto.id,
  };
}

/** A message body as the API takes it: 1–2000 characters after trimming. */
function messageBody(body: { body?: unknown } | null): string | null {
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  return text && text.length <= 2000 ? text : null;
}

/** The optional `Idempotency-Key` of a message post: a retry answers the first message. */
function messageReplay(request: Request, op: string, userId: string): { response?: Response; key: string | null } {
  const key = request.headers.get("idempotency-key");
  if (!key) return { key: null };
  if (!/^[0-9a-f-]{36}$/i.test(key)) return { response: problem(op, "idempotency.key_invalid"), key: null };
  const id = `${userId} ${new URL(request.url).pathname} ${key}`;
  const seen = service.replays.get(id);
  if (seen) {
    return {
      response: HttpResponse.json(seen.body as Record<string, unknown>, {
        status: seen.status,
        headers: { "idempotent-replayed": "true" },
      }),
      key: null,
    };
  }
  return { key: id };
}

/**
 * D-224: the requests I reported, and those of my current units created since my occupancy began — never a former
 * occupant's (their detail, thread, cancel and rating are 404 like the API's).
 */
function myRequests(account: MockAccount): MockRequest[] {
  seedResident(account);
  const since = new Map(account.units.map((u) => [u.unitId, occupancyStart(u)]));
  return [...service.requests.values()]
    .filter((r) => {
      if (r.residentUserId === account.userId) return true;
      if (r.seededFor !== account.userId) return false;
      const from = r.dto.unitId ? since.get(r.dto.unitId) : undefined;
      return from !== undefined && Date.parse(r.dto.createdAt) >= from;
    })
    .sort((a, b) => b.dto.createdAt.localeCompare(a.dto.createdAt));
}

export function myRequest(account: MockAccount, id: unknown): MockRequest | undefined {
  return myRequests(account).find((r) => r.dto.id === id);
}

function myWorkOrders(account: MockAccount): MockWorkOrder[] {
  seedTechnician(account);
  // D-226: an SMS sign-in sees no work order until the Owner confirms the phone match.
  if (account.technicianPending) return [];
  // …and a phone that matched nobody has no work at all.
  if (account.subject.startsWith("tech-phone:") && unmatchedPhone(account.phone)) return [];
  return [...service.workOrders.values()]
    .filter(
      (wo) =>
        wo.assigneeUserId === account.userId && ["assigned", "accepted", "in_progress", "done"].includes(wo.dto.status),
    )
    .sort((a, b) => (a.dto.scheduledAt ?? "").localeCompare(b.dto.scheduledAt ?? ""));
}

export function myWorkOrder(account: MockAccount, id: unknown): MockWorkOrder | undefined {
  return myWorkOrders(account).find((wo) => wo.dto.id === id);
}

async function json<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function workOrderRoute(
  action: string,
  operationId: string,
  run: (workOrder: MockWorkOrder, body: Record<string, unknown> | null) => Response | void,
) {
  return http.post(mswPath(`/v1/technician/work-orders/:workOrderId/${action}`), async ({ request, params }) => {
    const auth = authenticate(request, "technician", operationId);
    if (auth instanceof Response) return auth;
    const workOrder = myWorkOrder(auth.account, params.workOrderId);
    if (!workOrder) return problem(operationId, "http.not_found");
    const body = await json<Record<string, unknown>>(request);
    const refused = run(workOrder, body);
    if (refused) return refused;
    touch(workOrder);
    return HttpResponse.json(workOrderDto(workOrder), { status: action === "cost-lines" ? 201 : 200 });
  });
}

function requestOf(workOrder: MockWorkOrder): MockRequest | undefined {
  return workOrder.dto.serviceRequestId ? service.requests.get(workOrder.dto.serviceRequestId) : undefined;
}

const DECIMAL = /^\d{1,9}(\.\d{1,3})?$/;
const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

/** `"350"`, `"2"` → `"700.00"`: the mock engine's sum (the API computes this; the app never does). */
function lineAmount(quantity: string, unitPrice: string): string {
  const satang = BigInt(Math.round(Number(unitPrice) * 100)) * BigInt(Math.round(Number(quantity) * 1000));
  const value = satang / 1000n;
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

function sumMoney(amounts: readonly string[]): string {
  const total = amounts.reduce((sum, a) => sum + BigInt(a.replace(".", "")), 0n);
  return `${total / 100n}.${String(total % 100n).padStart(2, "0")}`;
}

export const serviceHandlers: HttpHandler[] = [
  // ── resident: categories, requests ──────────────────────────────────────────────────────────────
  http.get(mswPath("/v1/resident/service-categories"), ({ request }) => {
    const op = "resident.serviceRequests.categories";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const unitId = new URL(request.url).searchParams.get("unitId");
    const unit = auth.account.units.find((u) => u.unitId === unitId);
    if (!unit) return problem(op, "http.not_found");
    return HttpResponse.json({ data: categoriesOf(unit.tenantId) });
  }),

  http.get(mswPath("/v1/resident/service-requests"), ({ request }) => {
    const op = "resident.serviceRequests.list";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("perPage") ?? 25)));
    const openOnly = url.searchParams.get("open");
    let all = myRequests(auth.account);
    if (openOnly === "true")
      all = all.filter((r) => ["new", "triaged", "assigned", "in_progress", "waiting_parts"].includes(r.dto.status));
    return HttpResponse.json({
      data: all.slice((page - 1) * perPage, page * perPage).map(requestDto),
      meta: { page, perPage, total: all.length },
    });
  }),

  http.post(mswPath("/v1/resident/service-requests"), async ({ request }) => {
    const op = "resident.serviceRequests.create";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const key = request.headers.get("idempotency-key");
    if (key && !/^[0-9a-f-]{36}$/i.test(key)) return problem(op, "idempotency.key_invalid");
    const replayKey = key ? `${auth.account.userId} ${key}` : null;
    const seen = replayKey ? service.replays.get(replayKey) : undefined;
    if (seen) {
      return HttpResponse.json(seen.body as Record<string, unknown>, {
        status: seen.status,
        headers: { "idempotent-replayed": "true" },
      });
    }
    const body = await json<{
      unitId?: unknown;
      categoryId?: unknown;
      description?: unknown;
      priority?: unknown;
      photoDocumentIds?: unknown;
      preferredVisit?: unknown;
    }>(request);
    const unit = auth.account.units.find((u) => u.unitId === body?.unitId);
    if (!unit) return problem(op, "http.not_found");
    const category = CATEGORIES.find((c) => categoryId(unit.tenantId, c.key) === body?.categoryId);
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const photos = Array.isArray(body?.photoDocumentIds) ? body.photoDocumentIds.map(String) : [];
    const priorities = ["low", "normal", "high", "urgent"];
    const priority =
      typeof body?.priority === "string" && priorities.includes(body.priority) ? body.priority : "normal";
    const visits = ["anytime", "morning", "afternoon", "evening"];
    const preferredVisit = body?.preferredVisit ?? null;
    if (preferredVisit !== null && (typeof preferredVisit !== "string" || !visits.includes(preferredVisit))) {
      return problem(op, "validation.failed");
    }
    if (!category || description.length < 3 || description.length > 2000 || photos.length > 10) {
      return problem(op, "validation.failed");
    }
    if (!uploadedBy(auth.account.userId, photos, "service_request", unit.unitId))
      return problem(op, "validation.failed");
    myRequests(auth.account);
    const created = newRequest(
      auth.account,
      unit,
      {
        categoryKey: category.key,
        description,
        priority: priority as Schemas["ServicePriority"],
        photoIds: photos,
        preferredVisit: preferredVisit as Schemas["VisitPreference"] | null,
      },
      Date.now(),
    );
    if (auth.account.subject.toLowerCase().includes("warranty")) {
      created.dto.inWarranty = true;
      setStatus(created, "triaged");
    }
    const answer = requestDto(created);
    if (replayKey) service.replays.set(replayKey, { status: 201, body: answer });
    return HttpResponse.json(answer, { status: 201 });
  }),

  http.get(mswPath("/v1/resident/service-requests/:serviceRequestId"), ({ request, params }) => {
    const op = "resident.serviceRequests.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = myRequest(auth.account, params.serviceRequestId);
    if (!found) return problem(op, "http.not_found");
    return HttpResponse.json(requestDto(found));
  }),

  http.post(mswPath("/v1/resident/service-requests/:serviceRequestId/actions/cancel"), async ({ request, params }) => {
    const op = "resident.serviceRequests.cancel";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = myRequest(auth.account, params.serviceRequestId);
    if (!found) return problem(op, "http.not_found");
    const body = await json<{ reason?: unknown }>(request);
    const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (reason.length < 1) return problem(op, "validation.failed");
    if (!["new", "triaged"].includes(found.dto.status)) return problem(op, "service_request.invalid_state");
    setStatus(found, "cancelled");
    return HttpResponse.json(requestDto(found));
  }),

  http.post(mswPath("/v1/resident/service-requests/:serviceRequestId/actions/rate"), async ({ request, params }) => {
    const op = "resident.serviceRequests.rate";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = myRequest(auth.account, params.serviceRequestId);
    if (!found) return problem(op, "http.not_found");
    const body = await json<{ rating?: unknown; comment?: unknown }>(request);
    const rating = typeof body?.rating === "number" ? body.rating : NaN;
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return problem(op, "validation.failed");
    if (found.dto.status !== "done" || found.dto.rating !== null) return problem(op, "service_request.invalid_state");
    found.dto.rating = rating;
    found.dto.ratingComment = typeof body?.comment === "string" && body.comment.trim() ? body.comment.trim() : null;
    setStatus(found, "closed");
    return HttpResponse.json(requestDto(found));
  }),

  http.post(mswPath("/v1/resident/service-requests/:serviceRequestId/actions/confirm-visit"), ({ request, params }) => {
    const op = "resident.serviceRequests.confirmVisit";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = myRequest(auth.account, params.serviceRequestId);
    if (!found) return problem(op, "http.not_found");
    const visitAt = plannedVisitOf(found);
    if (!visitAt || !visitOf(found).due) return problem(op, "service_request.invalid_state");
    found.visitConfirmed = { at: bangkokIso(Date.now()), for: visitAt };
    for (const wo of workOrdersOf(found)) {
      emit(wo.assigneeUserId, "service_request.visit_confirmed", {
        serviceRequestId: found.dto.id,
        workOrderId: wo.dto.id,
      });
    }
    emit(found.residentUserId, "service_request.visit_confirmed", { serviceRequestId: found.dto.id });
    return HttpResponse.json(requestDto(found));
  }),

  http.get(mswPath("/v1/resident/service-requests/:serviceRequestId/messages"), ({ request, params }) => {
    const op = "resident.serviceRequests.messages";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = myRequest(auth.account, params.serviceRequestId);
    if (!found) return problem(op, "http.not_found");
    return HttpResponse.json({ data: found.messages.map((m) => messageDto(m, auth.account.userId)) });
  }),

  http.post(mswPath("/v1/resident/service-requests/:serviceRequestId/messages"), async ({ request, params }) => {
    const op = "resident.serviceRequests.postMessage";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = myRequest(auth.account, params.serviceRequestId);
    if (!found) return problem(op, "http.not_found");
    const replay = messageReplay(request, op, auth.account.userId);
    if (replay.response) return replay.response;
    const text = messageBody(await json<{ body?: unknown }>(request));
    if (!text) return problem(op, "validation.failed");
    if (found.dto.status === "closed" || found.dto.status === "cancelled") {
      return problem(op, "service_request.invalid_state");
    }
    const message = postMessage(
      found.messages,
      { userId: auth.account.userId, kind: "resident", name: auth.account.displayName },
      text,
      notifyOf(found),
    );
    const answer = messageDto(message, auth.account.userId);
    if (replay.key) service.replays.set(replay.key, { status: 201, body: answer });
    return HttpResponse.json(answer, { status: 201 });
  }),

  // ── technician: my work orders ──────────────────────────────────────────────────────────────────
  http.get(mswPath("/v1/technician/me"), ({ request }) => {
    const auth = authenticate(request, "technician", "technician.me.get");
    if (auth instanceof Response) return auth;
    const base = example<Schemas["TechnicianMeDto"]>("technician.me.get");
    const ids = myWorkOrders(auth.account).map((wo) => wo.dto.id);
    return HttpResponse.json({
      ...base,
      scopes: ids.map((id) => `work_order:${id}`),
      workOrderIds: ids,
      // D-226 / D-228 (LIFF #29): the SMS-matched party still waiting for the Owner.
      linkRequestsPending: auth.account.technicianPending ? 1 : 0,
      user: {
        ...base.user,
        id: auth.account.userId,
        displayName: auth.account.displayName,
        language: auth.account.language,
        lineLinked: auth.account.lineLinked,
        phone: auth.account.phone,
      },
    });
  }),

  http.get(mswPath("/v1/technician/work-orders"), ({ request }) => {
    const auth = authenticate(request, "technician", "technician.workOrders.list");
    if (auth instanceof Response) return auth;
    return HttpResponse.json({ data: myWorkOrders(auth.account).map(workOrderDto) });
  }),

  http.get(mswPath("/v1/technician/work-orders/:workOrderId"), ({ request, params }) => {
    const op = "technician.workOrders.get";
    const auth = authenticate(request, "technician", op);
    if (auth instanceof Response) return auth;
    const workOrder = myWorkOrder(auth.account, params.workOrderId);
    if (!workOrder) return problem(op, "http.not_found");
    return HttpResponse.json(workOrderDto(workOrder));
  }),

  http.get(mswPath("/v1/technician/work-orders/:workOrderId/messages"), ({ request, params }) => {
    const op = "technician.workOrders.messages";
    const auth = authenticate(request, "technician", op);
    if (auth instanceof Response) return auth;
    const workOrder = myWorkOrder(auth.account, params.workOrderId);
    if (!workOrder) return problem(op, "http.not_found");
    return HttpResponse.json({ data: threadOf(workOrder).map((m) => messageDto(m, auth.account.userId)) });
  }),

  http.post(mswPath("/v1/technician/work-orders/:workOrderId/messages"), async ({ request, params }) => {
    const op = "technician.workOrders.postMessage";
    const auth = authenticate(request, "technician", op);
    if (auth instanceof Response) return auth;
    const workOrder = myWorkOrder(auth.account, params.workOrderId);
    if (!workOrder) return problem(op, "http.not_found");
    const replay = messageReplay(request, op, auth.account.userId);
    if (replay.response) return replay.response;
    const text = messageBody(await json<{ body?: unknown }>(request));
    if (!text) return problem(op, "validation.failed");
    const found = requestOf(workOrder);
    if (found && (found.dto.status === "closed" || found.dto.status === "cancelled")) {
      return problem(op, "service_request.invalid_state");
    }
    if (!found && workOrder.dto.status === "cancelled") return problem(op, "work_order.invalid_state");
    const author = { userId: auth.account.userId, kind: "technician" as const, name: auth.account.displayName };
    const message = found
      ? postMessage(found.messages, author, text, notifyOf(found))
      : postMessage(workOrder.messages, author, text, {
          technicianUserIds: [workOrder.assigneeUserId],
          serviceRequestId: null,
          workOrderId: workOrder.dto.id,
        });
    const answer = messageDto(message, auth.account.userId);
    if (replay.key) service.replays.set(replay.key, { status: 201, body: answer });
    return HttpResponse.json(answer, { status: 201 });
  }),

  http.get(mswPath("/v1/technician/work-orders/:workOrderId/access"), ({ request, params }) => {
    const op = "technician.workOrders.access";
    const auth = authenticate(request, "technician", op);
    if (auth instanceof Response) return auth;
    const workOrder = myWorkOrder(auth.account, params.workOrderId);
    if (!workOrder) return problem(op, "http.not_found");
    const base = example<Schemas["RevealedCredentialsDto"]>("resident.access.credentials").data[0]!;
    const live = ["assigned", "accepted", "in_progress"].includes(workOrder.dto.status);
    return HttpResponse.json({
      data: live
        ? [
            {
              ...base,
              id: uuidFrom(`wo-cred#${workOrder.dto.id}`),
              holderKind: "technician",
              holderName: auth.account.displayName,
              holderPartyId: null,
              holderUserId: auth.account.userId,
              leaseId: null,
              lockName: `ประตูห้อง ${workOrder.dto.unitNo ?? ""}`.trim(),
              pin: "731905",
              unitId: workOrder.dto.unitId,
              unitNo: workOrder.dto.unitNo,
              validFrom: workOrder.dto.scheduledAt ?? workOrder.dto.createdAt,
              validTo: workOrder.dto.scheduledUntil,
              workOrderId: workOrder.dto.id,
            },
          ]
        : [],
    });
  }),

  workOrderRoute("actions/accept", "technician.workOrders.accept", (wo) => {
    if (wo.dto.status !== "assigned") return problem("technician.workOrders.accept", "work_order.invalid_state");
    wo.dto.status = "accepted";
    wo.dto.acceptedAt = bangkokIso(Date.now());
  }),

  workOrderRoute("actions/check-in", "technician.workOrders.checkIn", (wo) => {
    if (!["assigned", "accepted"].includes(wo.dto.status)) {
      return problem("technician.workOrders.checkIn", "work_order.invalid_state");
    }
    wo.dto.status = "in_progress";
    wo.dto.checkedInAt = bangkokIso(Date.now());
    const request = requestOf(wo);
    if (request && request.dto.status !== "in_progress") setStatus(request, "in_progress");
  }),

  workOrderRoute("actions/wait-parts", "technician.workOrders.waitParts", (wo) => {
    if (wo.dto.status !== "in_progress" || wo.waitingParts) {
      return problem("technician.workOrders.waitParts", "work_order.invalid_state");
    }
    wo.waitingParts = true;
    const request = requestOf(wo);
    if (request) setStatus(request, "waiting_parts");
  }),

  workOrderRoute("actions/resume", "technician.workOrders.resume", (wo) => {
    if (wo.dto.status !== "in_progress" || !wo.waitingParts) {
      return problem("technician.workOrders.resume", "work_order.invalid_state");
    }
    wo.waitingParts = false;
    const request = requestOf(wo);
    if (request) setStatus(request, "in_progress");
  }),

  workOrderRoute("cost-lines", "technician.workOrders.addCost", (wo, body) => {
    const op = "technician.workOrders.addCost";
    if (!["accepted", "in_progress", "assigned"].includes(wo.dto.status))
      return problem(op, "work_order.invalid_state");
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const quantity = typeof body?.quantity === "string" ? body.quantity : "1";
    const unitPrice = typeof body?.unitPrice === "string" ? body.unitPrice : "";
    const kinds = ["part", "labour", "travel", "other"];
    const kind = typeof body?.kind === "string" && kinds.includes(body.kind) ? body.kind : "part";
    if (!description || !DECIMAL.test(quantity) || !MONEY.test(unitPrice) || Number(quantity) <= 0) {
      return problem(op, "validation.failed");
    }
    const amount = lineAmount(quantity, unitPrice);
    wo.dto.costLines.push({
      id: crypto.randomUUID(),
      kind: kind as Schemas["WorkOrderCostKind"],
      description,
      quantity: Number(quantity).toFixed(3),
      unitPrice: Number(unitPrice).toFixed(2),
      amount,
      receiptDocumentId: null,
      vendorPartyId: null,
    });
    wo.dto.costTotal = sumMoney(wo.dto.costLines.map((l) => l.amount));
  }),

  http.post(mswPath("/v1/technician/work-orders/:workOrderId/photos"), async ({ request, params }) => {
    const op = "technician.workOrders.uploadPhoto";
    const auth = authenticate(request, "technician", op);
    if (auth instanceof Response) return auth;
    const workOrder = myWorkOrder(auth.account, params.workOrderId);
    if (!workOrder) return problem(op, "http.not_found");
    if (!["assigned", "accepted", "in_progress"].includes(workOrder.dto.status)) {
      return problem(op, "work_order.invalid_state");
    }
    const body = await json<{ contentType?: unknown; sizeBytes?: unknown; sha256?: unknown; role?: unknown }>(request);
    const fields = validPresign(body);
    if (!fields || (body?.role !== "before" && body?.role !== "after")) return problem(op, "validation.failed");
    const role = body.role;
    const answer = presign(auth.account.userId, fields, "work_order", workOrder.dto.id, role, "technician");
    // Attached at once; it counts once the bytes are uploaded (the list below shows uploaded ones).
    (role === "before" ? workOrder.dto.beforePhotoIds : workOrder.dto.afterPhotoIds).push(answer.fileId);
    touch(workOrder);
    return HttpResponse.json({ ...answer, role }, { status: 201 });
  }),

  workOrderRoute("actions/complete", "technician.workOrders.complete", (wo, body) => {
    const op = "technician.workOrders.complete";
    if (!["assigned", "accepted", "in_progress"].includes(wo.dto.status) || wo.waitingParts) {
      return problem(op, "work_order.invalid_state");
    }
    const uploaded = wo.dto.afterPhotoIds.filter((id) => uploads.get(id)?.done);
    if (uploaded.length === 0) return problem(op, "work_order.photo_required");
    const now = Date.now();
    wo.dto.afterPhotoIds = uploaded;
    wo.dto.beforePhotoIds = wo.dto.beforePhotoIds.filter((id) => uploads.get(id)?.done);
    wo.dto.status = "done";
    wo.dto.completedAt = bangkokIso(now);
    wo.dto.completionNote = typeof body?.note === "string" && body.note.trim() ? body.note.trim() : null;
    const request = requestOf(wo);
    if (request) {
      if (request.dto.status !== "in_progress") setStatus(request, "in_progress", now);
      setStatus(request, "done", now);
    }
  }),

  // ── mock-only control (e2e): the owner triages and assigns a technician ────────────────────────
  http.post(mswPath("/v1/resident/__mock/service-requests/:serviceRequestId/assign"), async ({ request, params }) => {
    const auth = authenticate(request, "resident", "resident.serviceRequests.get");
    if (auth instanceof Response) return auth;
    const found = myRequest(auth.account, params.serviceRequestId);
    if (!found) return problem("resident.serviceRequests.get", "http.not_found");
    const body = await json<{ technician?: unknown }>(request);
    const sub = typeof body?.technician === "string" ? body.technician : "Umock-tech-assigned";
    const technician = accountFor(`line:${sub}`, { displayName: "ช่างวิชัย", phone: null, lineLinked: true });
    service.seeded.add(technician.userId);
    const workOrder = assignToTechnician(found, technician, Date.now() + HOUR);
    return HttpResponse.json({ workOrderId: workOrder.dto.id, request: requestDto(found) });
  }),

  // The office moves the planned visit: the resident's confirmation no longer counts and is asked again (D-218).
  http.post(
    mswPath("/v1/resident/__mock/service-requests/:serviceRequestId/reschedule"),
    async ({ request, params }) => {
      const auth = authenticate(request, "resident", "resident.serviceRequests.get");
      if (auth instanceof Response) return auth;
      const found = myRequest(auth.account, params.serviceRequestId);
      const workOrder = found
        ? workOrdersOf(found).find((wo) => wo.dto.scheduledAt === plannedVisitOf(found))
        : undefined;
      if (!found || !workOrder) return problem("resident.serviceRequests.get", "http.not_found");
      const body = await json<{ hours?: unknown }>(request);
      const hours = typeof body?.hours === "number" ? body.hours : 24;
      const start = Date.parse(workOrder.dto.scheduledAt!) + hours * HOUR;
      workOrder.dto.scheduledAt = bangkokIso(start);
      workOrder.dto.scheduledUntil = bangkokIso(start + 4 * HOUR);
      found.dto.visitAt = plannedVisitOf(found);
      touch(workOrder);
      return HttpResponse.json(requestDto(found));
    },
  ),

  // The office writes on the request's thread (getproperty-web's side, played by the mock).
  http.post(
    mswPath("/v1/resident/__mock/service-requests/:serviceRequestId/office-message"),
    async ({ request, params }) => {
      const auth = authenticate(request, "resident", "resident.serviceRequests.get");
      if (auth instanceof Response) return auth;
      const found = myRequest(auth.account, params.serviceRequestId);
      if (!found) return problem("resident.serviceRequests.get", "http.not_found");
      const text = messageBody(await json<{ body?: unknown }>(request)) ?? "รับทราบค่ะ";
      const message = postMessage(
        found.messages,
        { userId: null, kind: "office", name: found.buildingName },
        text,
        notifyOf(found),
      );
      return HttpResponse.json(messageDto(message, auth.account.userId), { status: 201 });
    },
  ),
];
