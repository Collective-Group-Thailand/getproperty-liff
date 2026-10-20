/**
 * Presigned photo uploads in the mock API (contract `resident.uploads.presign`, `technician.workOrders.uploadPhoto`):
 * the presign answers a PUT URL — in the mock the BFF itself (`…/uploads/{fileId}/content`), in production object
 * storage — and the photo counts once its bytes arrived. Purposes and the row they belong to are checked like the API
 * (a deposit waiting for my answer, a unit I occupy, a work order assigned to me); type ≤ JPEG/PNG/WebP, ≤ 10 MB,
 * a 64-hex SHA-256. One store per server process (`globalThis`), like the rest of the mock state.
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import { mswPath, problem } from "./contract";
import { authenticate } from "./handlers";
import { residenceOf } from "./residence";
import { bangkokIso } from "./tokens";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface MockUpload {
  fileId: string;
  userId: string;
  purpose: "deposit_dispute" | "service_request" | "work_order";
  /** The deposit, unit or work order the photo belongs to. */
  ref: string;
  role: "before" | "after" | null;
  contentType: string;
  sha256: string;
  bytes: number;
  done: boolean;
  createdAt: string;
}

const holder = globalThis as typeof globalThis & { __gpMockUploads?: Map<string, MockUpload> };
holder.__gpMockUploads ??= new Map();
export const uploads = holder.__gpMockUploads;

/** True when every id is a finished upload of this user for that purpose and row. */
export function uploadedBy(userId: string, ids: readonly string[], purpose: MockUpload["purpose"], ref: string) {
  return ids.every((id) => {
    const upload = uploads.get(id);
    return upload?.done && upload.userId === userId && upload.purpose === purpose && upload.ref === ref;
  });
}

/** A small SVG "photo" as a data URL (the API's photo links are 5-minute signed URLs). */
export function mockPhoto(label: string, hue = 200): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360"><rect width="480" height="360" fill="hsl(${hue} 30% 82%)"/><text x="240" y="190" font-family="sans-serif" font-size="24" text-anchor="middle" fill="#223">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

export function validPresign(body: { contentType?: unknown; sizeBytes?: unknown; sha256?: unknown } | null) {
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";
  const size = typeof body?.sizeBytes === "number" ? body.sizeBytes : 0;
  const sha256 = typeof body?.sha256 === "string" ? body.sha256 : "";
  if (!TYPES.has(contentType) || size <= 0 || size > MAX_UPLOAD_BYTES || !/^[0-9a-f]{64}$/i.test(sha256)) return null;
  return { contentType, size, sha256 };
}

export function presign(
  userId: string,
  fields: { contentType: string; size: number; sha256: string },
  purpose: MockUpload["purpose"],
  ref: string,
  role: MockUpload["role"],
  surface: "resident" | "technician",
) {
  const fileId = crypto.randomUUID();
  const now = Date.now();
  uploads.set(fileId, {
    fileId,
    userId,
    purpose,
    ref,
    role,
    contentType: fields.contentType,
    sha256: fields.sha256,
    bytes: fields.size,
    done: false,
    createdAt: bangkokIso(now),
  });
  return {
    fileId,
    uploadUrl: `/bff/v1/${surface}/uploads/${fileId}/content`,
    method: "PUT",
    headers: { "Content-Type": fields.contentType },
    expiresAt: bangkokIso(now + 15 * 60_000),
  };
}

async function json<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function putContent(surface: "resident" | "technician") {
  // The mock's stand-in for the object-storage PUT of a presigned URL.
  return http.put(mswPath(`/v1/${surface}/uploads/:fileId/content`), async ({ request, params }) => {
    const op = surface === "resident" ? "resident.uploads.presign" : "technician.workOrders.uploadPhoto";
    const auth = authenticate(request, surface, op);
    if (auth instanceof Response) return auth;
    const upload = uploads.get(String(params.fileId));
    if (!upload || upload.userId !== auth.account.userId) return problem(op, "http.not_found");
    const bytes = (await request.arrayBuffer()).byteLength;
    if (bytes === 0 || bytes > MAX_UPLOAD_BYTES) return problem(op, "validation.failed");
    upload.done = true;
    upload.bytes = bytes;
    return new HttpResponse(null, { status: 200 });
  });
}

export const uploadHandlers: HttpHandler[] = [
  http.post(mswPath("/v1/resident/uploads"), async ({ request }) => {
    const op = "resident.uploads.presign";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const body = await json<{
      purpose?: unknown;
      depositId?: unknown;
      unitId?: unknown;
      contentType?: unknown;
      sizeBytes?: unknown;
      sha256?: unknown;
    }>(request);
    const fields = validPresign(body);
    if (!fields) return problem(op, "validation.failed");
    if (body?.purpose === "deposit_dispute") {
      const deposit = residenceOf(auth.account).deposits.find((d) => d.id === body.depositId);
      if (!deposit) return problem(op, "http.not_found");
      if (deposit.settlement?.status !== "proposed") return problem(op, "deposit.invalid_state");
      const answer = presign(auth.account.userId, fields, "deposit_dispute", deposit.id, null, "resident");
      return HttpResponse.json({ ...answer, purpose: "deposit_dispute" }, { status: 201 });
    }
    if (body?.purpose === "service_request") {
      if (!auth.account.units.some((u) => u.unitId === body.unitId)) return problem(op, "http.not_found");
      const answer = presign(auth.account.userId, fields, "service_request", String(body.unitId), null, "resident");
      return HttpResponse.json({ ...answer, purpose: "service_request" }, { status: 201 });
    }
    return problem(op, "validation.failed");
  }),
  putContent("resident"),
  putContent("technician"),
];
