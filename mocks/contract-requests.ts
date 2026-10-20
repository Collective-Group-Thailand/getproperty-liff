/**
 * Mocks for what this app needs and getproperty-api's contract (`57eef37`) does not publish yet. Every handler here
 * is a row in `docs/contract-requests.md` and is marked `// CONTRACT-REQUEST`; it is deleted when the contract ships
 * the operation (then `mocks/generated` covers it). Problem bodies reuse codes the contract already documents
 * (`validation.failed`, `http.not_found`, `service_request.invalid_state`, `auth.forbidden`), never new ones.
 *
 * Fields the contract lacks on published shapes (request photo links / history / SLA / visit confirmation, work-order
 * photo links and rating, the visitor policy) are added by the stateful views in `mocks/service.ts` and
 * `mocks/community.ts`, marked the same way.
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import { mswPath, problem } from "./contract";
import { visitorCodes } from "./community";
import { emit } from "./events";
import { authenticate } from "./handlers";
import { myRequest, myWorkOrder, requestView, service, type MockRequest } from "./service";
import { accountById } from "./state";
import { bangkokIso } from "./tokens";

async function json<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function thread(request: MockRequest, userId: string) {
  return {
    data: request.messages.map((m) => ({
      id: m.id,
      author: m.author,
      authorName: m.authorName,
      body: m.body,
      createdAt: m.at,
      mine: m.authorUserId === userId,
    })),
  };
}

function post(request: MockRequest, userId: string, author: "resident" | "technician", body: string) {
  const account = accountById(userId);
  request.messages.push({
    id: crypto.randomUUID(),
    authorUserId: userId,
    author,
    authorName: account?.displayName ?? "",
    body,
    at: bangkokIso(Date.now()),
  });
  emit(request.residentUserId, "service_request.changed", { serviceRequestId: request.dto.id });
}

export const contractRequestHandlers: HttpHandler[] = [
  // CONTRACT-REQUEST #23 — the request's thread (resident ↔ office ↔ technician), never phone numbers.
  http.get(mswPath("/v1/resident/service-requests/:serviceRequestId/messages"), ({ request, params }) => {
    const op = "resident.serviceRequests.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = myRequest(auth.account, params.serviceRequestId);
    if (!found) return problem(op, "http.not_found");
    return HttpResponse.json(thread(found, auth.account.userId));
  }),

  http.post(mswPath("/v1/resident/service-requests/:serviceRequestId/messages"), async ({ request, params }) => {
    const op = "resident.serviceRequests.cancel";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = myRequest(auth.account, params.serviceRequestId);
    if (!found) return problem(op, "http.not_found");
    const body = await json<{ body?: unknown }>(request);
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (!text || text.length > 1000) return problem(op, "validation.failed");
    if (["closed", "cancelled"].includes(found.dto.status)) return problem(op, "service_request.invalid_state");
    post(found, auth.account.userId, "resident", text);
    return HttpResponse.json(thread(found, auth.account.userId), { status: 201 });
  }),

  // CONTRACT-REQUEST #24 — the resident confirms the planned visit (`confirm-visit` in `nextActions`).
  http.post(mswPath("/v1/resident/service-requests/:serviceRequestId/actions/confirm-visit"), ({ request, params }) => {
    const op = "resident.serviceRequests.cancel";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const found = myRequest(auth.account, params.serviceRequestId);
    if (!found) return problem(op, "http.not_found");
    if (!found.dto.visitAt || found.dto.status !== "assigned") return problem(op, "service_request.invalid_state");
    found.visitConfirmedAt ??= bangkokIso(Date.now());
    return HttpResponse.json(requestView(found));
  }),

  // CONTRACT-REQUEST #23 — the technician writes on the same thread through the platform.
  http.get(mswPath("/v1/technician/work-orders/:workOrderId/messages"), ({ request, params }) => {
    const op = "technician.workOrders.get";
    const auth = authenticate(request, "technician", op);
    if (auth instanceof Response) return auth;
    const workOrder = myWorkOrder(auth.account, params.workOrderId);
    const found = workOrder?.dto.serviceRequestId ? service.requests.get(workOrder.dto.serviceRequestId) : undefined;
    if (!found) return problem(op, "http.not_found");
    return HttpResponse.json(thread(found, auth.account.userId));
  }),

  http.post(mswPath("/v1/technician/work-orders/:workOrderId/messages"), async ({ request, params }) => {
    const op = "technician.workOrders.complete";
    const auth = authenticate(request, "technician", op);
    if (auth instanceof Response) return auth;
    const workOrder = myWorkOrder(auth.account, params.workOrderId);
    const found = workOrder?.dto.serviceRequestId ? service.requests.get(workOrder.dto.serviceRequestId) : undefined;
    if (!found) return problem(op, "http.not_found");
    const body = await json<{ body?: unknown }>(request);
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (!text || text.length > 1000) return problem(op, "validation.failed");
    post(found, auth.account.userId, "technician", text);
    return HttpResponse.json(thread(found, auth.account.userId), { status: 201 });
  }),

  // CONTRACT-REQUEST #26 — a time-boxed visitor code for my unit, when the operator allows it.
  http.post(mswPath("/v1/resident/access/visitor-codes"), async ({ request }) => {
    const op = "resident.access.credentials";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const body = await json<{ unitId?: unknown; visitorName?: unknown; validFrom?: unknown; validTo?: unknown }>(
      request,
    );
    const result = visitorCodes(auth.account, body);
    if (result instanceof Response) return result;
    return HttpResponse.json(result, { status: 201 });
  }),
];
