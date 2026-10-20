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
 * Mock-only control (never in the contract, never in a real build): `POST /v1/resident/__mock/service-requests/{id}/assign
 * { technician: "<LINE sub>" }` plays the owner — triage + a work order assigned to that technician (L4 e2e).
 */
import { createHash } from "node:crypto";

import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { example, mswPath, problem } from "./contract";
import { emit } from "./events";
import { authenticate } from "./handlers";
import { accountFor, UNIT_A, UNIT_B, type MockAccount } from "./state";
import { bangkokIso } from "./tokens";
import { mockPhoto, presign, uploadedBy, uploads, validPresign } from "./uploads";

type Schemas = components["schemas"];
type Request_ = Schemas["ResidentServiceRequestDto"];
type WorkOrder = Schemas["TechnicianWorkOrderDto"];
type Status = Schemas["ServiceRequestStatus"];

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
  tenantId: string;
  buildingId: string;
  buildingName: string;
  events: { status: Status; at: string }[];
  slaHours: number;
  visitConfirmedAt: string | null;
  messages: { id: string; authorUserId: string | null; author: string; authorName: string; body: string; at: string }[];
}

export interface MockWorkOrder {
  dto: WorkOrder;
  assigneeUserId: string;
  waitingParts: boolean;
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

function newRequest(
  account: MockAccount,
  unit: typeof UNIT_A,
  fields: { categoryKey: string; description: string; priority: Schemas["ServicePriority"]; photoIds: string[] },
  at: number,
): MockRequest {
  const cat = CATEGORIES.find((c) => c.key === fields.categoryKey) ?? CATEGORIES[7];
  const id = crypto.randomUUID();
  refSeq += 1;
  const request: MockRequest = {
    residentUserId: account.userId,
    tenantId: unit.tenantId,
    buildingId: unit.buildingId,
    buildingName: unit.buildingName,
    events: [{ status: "new", at: bangkokIso(at) }],
    slaHours: cat.slaHours,
    visitConfirmedAt: null,
    messages: [],
    dto: {
      ...example<Request_>("resident.serviceRequests.get"),
      id,
      ref: `SR-${String(1000 + refSeq)}`,
      category: { id: categoryId(unit.tenantId, cat.key), key: cat.key, nameTh: cat.nameTh, nameEn: cat.nameEn },
      description: fields.description,
      priority: fields.priority,
      photoIds: fields.photoIds,
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
): MockWorkOrder {
  if (request.dto.status === "new") setStatus(request, "triaged", now);
  const base = example<WorkOrder>("technician.workOrders.get");
  const workOrder: MockWorkOrder = {
    assigneeUserId: technician.userId,
    waitingParts: false,
    dto: {
      ...base,
      id: crypto.randomUUID(),
      title: `${request.dto.category.nameTh} — ${request.dto.unitNo ?? ""}`.trim(),
      description: request.dto.description,
      requestDescription: request.dto.description,
      requestPhotoIds: [...request.dto.photoIds],
      beforePhotoIds: [],
      afterPhotoIds: [],
      categoryKey: request.dto.category.key,
      priority: request.dto.priority,
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
  request.dto.visitAt = workOrder.dto.scheduledAt;
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

function seedResident(account: MockAccount): void {
  if (service.seeded.has(account.userId)) return;
  service.seeded.add(account.userId);
  const has = (word: string) => account.subject.toLowerCase().includes(word);
  if (account.units.length === 0 || has("norequests")) return;
  const unit = account.units.some((u) => u.unitId === UNIT_A.unitId) ? UNIT_A : UNIT_B;
  const now = Date.now();
  const crew = accountFor("line:Umock-crew-somsak", { displayName: "ช่างสมศักดิ์", phone: null, lineLinked: true });

  const closed = newRequest(
    account,
    unit,
    { categoryKey: "electrical", description: "ปลั๊กไฟข้างเตียงไม่มีไฟ", priority: "normal", photoIds: [] },
    now - 20 * DAY,
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
    { categoryKey: "plumbing", description: "ก๊อกน้ำอ่างล้างหน้ารั่ว", priority: "normal", photoIds: [] },
    now - DAY,
  );
  assignToTechnician(open, crew, now + 6 * HOUR, now - 20 * HOUR);
  open.messages.push({
    id: crypto.randomUUID(),
    authorUserId: null,
    author: "office",
    authorName: UNIT_A.tenantName,
    body: "รับเรื่องแล้วค่ะ ช่างจะเข้าไปตามเวลานัด",
    at: bangkokIso(now - 20 * HOUR),
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
  assignToTechnician(leak, account, now + 2 * HOUR);
  const light = newRequest(
    resident,
    UNIT_B,
    { categoryKey: "electrical", description: "หลอดไฟห้องน้ำขาด", priority: "normal", photoIds: [] },
    now - 2 * DAY,
  );
  const second = assignToTechnician(light, account, now + DAY + 3 * HOUR);
  second.dto.status = "accepted";
  second.dto.acceptedAt = bangkokIso(now - HOUR);
  second.dto.nextActions = technicianActions(second);
}

/** CONTRACT-REQUEST #22 / #24 — the request with its photo links, status history, SLA and visit confirmation. */
export function requestView(request: MockRequest) {
  const photos = [
    ...request.dto.photoIds.map((id, index) => ({
      id,
      role: "report" as const,
      url: mockPhoto(`แจ้งซ่อม ${index + 1}`),
    })),
    ...[...service.workOrders.values()]
      .filter((wo) => wo.dto.serviceRequestId === request.dto.id)
      .flatMap((wo) =>
        wo.dto.afterPhotoIds.map((id, index) => ({
          id,
          role: "after" as const,
          url: mockPhoto(`หลังซ่อม ${index + 1}`, 140),
        })),
      ),
  ];
  const open = ["new", "triaged", "assigned", "in_progress"].includes(request.dto.status);
  const dueAt = Date.parse(request.dto.createdAt) + request.slaHours * HOUR;
  const nextActions = [...request.dto.nextActions];
  if (request.dto.visitAt && !request.visitConfirmedAt && ["assigned"].includes(request.dto.status)) {
    nextActions.push("confirm-visit");
  }
  return {
    ...request.dto,
    nextActions,
    photos,
    events: request.events,
    sla:
      request.dto.inWarranty || !open
        ? request.dto.status === "waiting_parts"
          ? { dueAt: bangkokIso(dueAt), state: "paused" as const }
          : { dueAt: null, state: "none" as const }
        : {
            dueAt: bangkokIso(dueAt),
            state:
              Date.now() > dueAt
                ? ("breached" as const)
                : Date.now() > dueAt - 2 * HOUR
                  ? ("at_risk" as const)
                  : ("on_track" as const),
          },
    visitConfirmedAt: request.visitConfirmedAt,
  };
}

/** CONTRACT-REQUEST #25 — the work order with photo links and the resident's rating once closed. */
export function workOrderView(workOrder: MockWorkOrder) {
  const request = workOrder.dto.serviceRequestId ? service.requests.get(workOrder.dto.serviceRequestId) : undefined;
  const link = (role: "report" | "before" | "after", label: string, hue: number) => (id: string, index: number) => ({
    id,
    role,
    url: mockPhoto(`${label} ${index + 1}`, hue),
  });
  return {
    ...workOrder.dto,
    photos: [
      ...workOrder.dto.requestPhotoIds.map(link("report", "แจ้งซ่อม", 200)),
      ...workOrder.dto.beforePhotoIds.map(link("before", "ก่อนซ่อม", 30)),
      ...workOrder.dto.afterPhotoIds.map(link("after", "หลังซ่อม", 140)),
    ],
    rating: request?.dto.rating ?? null,
    ratingComment: request?.dto.ratingComment ?? null,
  };
}

function myRequests(account: MockAccount): MockRequest[] {
  seedResident(account);
  return [...service.requests.values()]
    .filter((r) => r.residentUserId === account.userId)
    .sort((a, b) => b.dto.createdAt.localeCompare(a.dto.createdAt));
}

export function myRequest(account: MockAccount, id: unknown): MockRequest | undefined {
  return myRequests(account).find((r) => r.dto.id === id);
}

function myWorkOrders(account: MockAccount): MockWorkOrder[] {
  seedTechnician(account);
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
    return HttpResponse.json(workOrderView(workOrder), { status: action === "cost-lines" ? 201 : 200 });
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
      data: all.slice((page - 1) * perPage, page * perPage).map((r) => r.dto),
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
    }>(request);
    const unit = auth.account.units.find((u) => u.unitId === body?.unitId);
    if (!unit) return problem(op, "http.not_found");
    const category = CATEGORIES.find((c) => categoryId(unit.tenantId, c.key) === body?.categoryId);
    const description = typeof body?.description === "string" ? body.description.trim() : "";
    const photos = Array.isArray(body?.photoDocumentIds) ? body.photoDocumentIds.map(String) : [];
    const priorities = ["low", "normal", "high", "urgent"];
    const priority =
      typeof body?.priority === "string" && priorities.includes(body.priority) ? body.priority : "normal";
    if (!category || description.length < 3 || description.length > 2000 || photos.length > 10) {
      return problem(op, "validation.failed");
    }
    if (!uploadedBy(auth.account.userId, photos, "service_request", unit.unitId))
      return problem(op, "validation.failed");
    myRequests(auth.account);
    const created = newRequest(
      auth.account,
      unit,
      { categoryKey: category.key, description, priority: priority as Schemas["ServicePriority"], photoIds: photos },
      Date.now(),
    );
    if (auth.account.subject.toLowerCase().includes("warranty")) {
      created.dto.inWarranty = true;
      setStatus(created, "triaged");
    }
    if (replayKey) service.replays.set(replayKey, { status: 201, body: created.dto });
    return HttpResponse.json(created.dto, { status: 201 });
  }),

  http.get(mswPath("/v1/resident/service-requests/:serviceRequestId"), ({ request, params }) => {
    const op = "resident.serviceRequests.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = myRequest(auth.account, params.serviceRequestId);
    if (!found) return problem(op, "http.not_found");
    // CONTRACT-REQUEST #22 / #24 — photo links, history, SLA, visit confirmation (mocks/contract-requests.ts).
    return HttpResponse.json(requestView(found));
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
    return HttpResponse.json(found.dto);
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
    return HttpResponse.json(found.dto);
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
    return HttpResponse.json({ data: myWorkOrders(auth.account).map((wo) => wo.dto) });
  }),

  http.get(mswPath("/v1/technician/work-orders/:workOrderId"), ({ request, params }) => {
    const op = "technician.workOrders.get";
    const auth = authenticate(request, "technician", op);
    if (auth instanceof Response) return auth;
    const workOrder = myWorkOrder(auth.account, params.workOrderId);
    if (!workOrder) return problem(op, "http.not_found");
    // CONTRACT-REQUEST #25 — photo links and the resident's rating (mocks/contract-requests.ts).
    return HttpResponse.json(workOrderView(workOrder));
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
    return HttpResponse.json({ workOrderId: workOrder.dto.id, request: found.dto });
  }),
];
