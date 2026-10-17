/**
 * Mocks for what this app needs and getproperty-api's contract does not publish yet. Every handler here is a
 * row in `docs/contract-requests.md` and is marked `// CONTRACT-REQUEST`; it is deleted when the contract
 * ships the operation (then `mocks/generated` covers it). Problem bodies reuse codes the contract already
 * documents elsewhere (`validation.failed`, `http.not_found`, `lease.invalid_state`), never new ones.
 *
 * Fields the contract lacks on published shapes (lease `noticeEarliestDate` / `rulesAcknowledgedAt`, deduction
 * `beforeEvidenceUrls`, dispute `photoDocumentIds`) are added by the stateful handlers in `mocks/resident.ts`.
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import { mswPath, problem } from "./contract";
import { authenticate } from "./handlers";
import { residenceOf } from "./residence";
import { leaseView } from "./resident";
import { bangkokIso } from "./tokens";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

async function json<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export const contractRequestHandlers: HttpHandler[] = [
  // CONTRACT-REQUEST #8 — POST /v1/resident/leases/{leaseId}/rules/acknowledge → ResidentLeaseDto with
  // `rulesAcknowledgedAt` (the building rules of the lease's addendum, read and acknowledged).
  http.post(mswPath("/v1/resident/leases/:leaseId/rules/acknowledge"), ({ request, params }) => {
    const op = "resident.leases.get";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const lease = residenceOf(auth.account).leases.find((l) => l.dto.id === params.leaseId);
    if (!lease) return problem(op, "http.not_found");
    if (["ended", "terminated", "cancelled"].includes(lease.dto.status)) {
      return problem("resident.leases.contract", "lease.invalid_state");
    }
    lease.rulesAcknowledgedAt ??= bangkokIso(Date.now());
    return HttpResponse.json(leaseView(lease));
  }),

  // CONTRACT-REQUEST #9 — POST /v1/resident/uploads { purpose, contentType, sizeBytes } → a presigned upload
  // (`fileId`, `uploadUrl`, `method: PUT`, `headers`, `expiresAt`) for dispute photos. The mock's upload target is
  // the BFF itself; the real one is object storage.
  http.post(mswPath("/v1/resident/uploads"), async ({ request }) => {
    const op = "resident.me.update";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const body = await json<{ purpose?: unknown; contentType?: unknown; sizeBytes?: unknown }>(request);
    const contentType = typeof body?.contentType === "string" ? body.contentType : "";
    const size = typeof body?.sizeBytes === "number" ? body.sizeBytes : 0;
    if (body?.purpose !== "deposit_dispute" || !/^image\/(jpeg|png|webp)$/.test(contentType)) {
      return problem(op, "validation.failed");
    }
    if (size <= 0 || size > MAX_UPLOAD_BYTES) return problem(op, "validation.failed");
    const fileId = crypto.randomUUID();
    residenceOf(auth.account).uploads.set(fileId, { contentType, bytes: size, done: false });
    return HttpResponse.json(
      {
        fileId,
        uploadUrl: `/bff/v1/resident/uploads/${fileId}/content`,
        method: "PUT",
        headers: { "content-type": contentType },
        expiresAt: bangkokIso(Date.now() + 10 * 60_000),
      },
      { status: 201 },
    );
  }),

  // CONTRACT-REQUEST #9 — the mock's stand-in for the object-storage PUT.
  http.put(mswPath("/v1/resident/uploads/:fileId/content"), async ({ request, params }) => {
    const op = "resident.me.update";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const upload = residenceOf(auth.account).uploads.get(String(params.fileId));
    if (!upload) return problem(op, "http.not_found");
    const bytes = (await request.arrayBuffer()).byteLength;
    if (bytes === 0 || bytes > MAX_UPLOAD_BYTES) return problem(op, "validation.failed");
    upload.done = true;
    upload.bytes = bytes;
    return new HttpResponse(null, { status: 200 });
  }),

  // CONTRACT-REQUEST #10 — GET/PUT /v1/resident/me/notification-preferences: per topic, LINE and SMS on/off;
  // `locked` topics (bills, lease notices) cannot be switched off.
  http.get(mswPath("/v1/resident/me/notification-preferences"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.me.get");
    if (auth instanceof Response) return auth;
    return HttpResponse.json({ items: residenceOf(auth.account).preferences });
  }),

  http.put(mswPath("/v1/resident/me/notification-preferences"), async ({ request }) => {
    const op = "resident.me.update";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const residence = residenceOf(auth.account);
    const body = await json<{ items?: { topic?: unknown; line?: unknown; sms?: unknown }[] }>(request);
    if (!body || !Array.isArray(body.items)) return problem(op, "validation.failed");
    for (const item of body.items) {
      const current = residence.preferences.find((p) => p.topic === item.topic);
      if (!current || typeof item.line !== "boolean" || typeof item.sms !== "boolean") {
        return problem(op, "validation.failed");
      }
      if (current.locked && (!item.line || !item.sms)) return problem(op, "validation.failed");
    }
    for (const item of body.items) {
      const current = residence.preferences.find((p) => p.topic === item.topic)!;
      current.line = item.line as boolean;
      current.sms = item.sms as boolean;
    }
    return HttpResponse.json({ items: residence.preferences });
  }),

  // CONTRACT-REQUEST #11 — GET /v1/resident/documents (documents on file, view only) and
  // GET /v1/resident/documents/{documentId}/download → a 5-minute signed URL.
  http.get(mswPath("/v1/resident/documents"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.me.get");
    if (auth instanceof Response) return auth;
    return HttpResponse.json(residenceOf(auth.account).documents);
  }),

  http.get(mswPath("/v1/resident/documents/:documentId/download"), ({ request, params }) => {
    const op = "resident.leases.contract";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const document = residenceOf(auth.account).documents.find((d) => d.id === params.documentId);
    if (!document) return problem(op, "http.not_found");
    return HttpResponse.json({
      url: `https://storage.example.com/documents/${document.id}.pdf?X-Goog-Signature=mock`,
      expiresAt: bangkokIso(Date.now() + 5 * 60_000),
    });
  }),
];
