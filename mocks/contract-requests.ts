/**
 * Mocks for what this app needs and getproperty-api's contract does not publish yet. Every handler here is a
 * row in `docs/contract-requests.md` and is marked `// CONTRACT-REQUEST`; it is deleted when the contract
 * ships the operation (then `mocks/generated` covers it). Problem bodies reuse codes the contract already
 * documents elsewhere (`invitation.*`, `validation.failed`), never new ones.
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import { example, problemResponse } from "./contract";
import { authenticate, residentMe } from "./handlers";
import { UNIT_A, UNIT_B } from "./state";

/** The contract's own example bodies of the problem codes these mocks answer with. */
const INVITATION_NOT_FOUND = {
  type: "https://errors.getproperty.co/invitation.not_found",
  title: "ไม่พบคำเชิญ",
  status: 404,
  code: "invitation.not_found",
  detail: "รหัสคำเชิญไม่ถูกต้อง",
};
const INVITATION_NOT_PENDING = {
  type: "https://errors.getproperty.co/invitation.not_pending",
  title: "คำเชิญใช้ไม่ได้แล้ว",
  status: 409,
  code: "invitation.not_pending",
  detail: "คำเชิญนี้ถูกใช้ ยกเลิก หรือหมดอายุแล้ว",
};
const VALIDATION_FAILED = {
  type: "https://errors.getproperty.co/validation.failed",
  title: "ข้อมูลไม่ถูกต้อง",
  status: 422,
  code: "validation.failed",
  detail: "กรุณาตรวจสอบข้อมูลที่กรอก",
};

/** Codes the mock understands: `OK…` links a unit, `USED…`/`EXPIRED…` were used or expired, anything else is unknown. */
export const MOCK_INVITATION = { valid: "OK-7KQ2M9", used: "USED-4F8P2A", expired: "EXPIRED-9X3L1C" };

export const contractRequestHandlers: HttpHandler[] = [
  // CONTRACT-REQUEST #1 — POST /v1/resident/link { code } → { units } (accept an operator's invitation, D-061).
  http.post("*/v1/resident/link", async ({ request }) => {
    const auth = authenticate(request, "resident", "resident.me.get");
    if (auth instanceof Response) return auth;
    let code = "";
    try {
      const body = (await request.json()) as { code?: unknown };
      code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
    } catch {
      code = "";
    }
    if (!/^[A-Z0-9-]{4,32}$/.test(code)) {
      return problemResponse(422, {
        ...VALIDATION_FAILED,
        errors: [{ path: "code", code: "matches", message: "code must be 4–32 letters or digits" }],
      });
    }
    if (code.startsWith("USED") || code.startsWith("EXPIRED")) return problemResponse(409, INVITATION_NOT_PENDING);
    if (!code.startsWith("OK")) return problemResponse(404, INVITATION_NOT_FOUND);
    if (auth.account.accepted.has(code)) return problemResponse(409, INVITATION_NOT_PENDING);
    auth.account.accepted.add(code);
    const unit = auth.account.units.some((u) => u.unitId === UNIT_A.unitId) ? UNIT_B : UNIT_A;
    if (!auth.account.units.some((u) => u.unitId === unit.unitId)) auth.account.units.push(unit);
    return HttpResponse.json({ units: [unit] });
  }),

  // CONTRACT-REQUEST #3 — PATCH /v1/resident/me { language } → ResidentMeDto (the language switcher, D-064).
  http.patch("*/v1/resident/me", async ({ request }) => {
    const auth = authenticate(request, "resident", "resident.me.get");
    if (auth instanceof Response) return auth;
    let language: unknown;
    try {
      language = ((await request.json()) as { language?: unknown }).language;
    } catch {
      language = undefined;
    }
    if (typeof language !== "string" || !["th", "en", "my", "km", "lo", "zh"].includes(language)) {
      return problemResponse(422, {
        ...VALIDATION_FAILED,
        errors: [{ path: "language", code: "isIn", message: "language must be th, en, my, km, lo or zh" }],
      });
    }
    auth.account.language = language;
    return HttpResponse.json(residentMe(auth.account));
  }),

  // CONTRACT-REQUEST #5 — POST /v1/resident/push-subscriptions (web push after the first payment, L2).
  http.post("*/v1/resident/push-subscriptions", async ({ request }) => {
    const auth = authenticate(request, "resident", "resident.me.get");
    if (auth instanceof Response) return auth;
    const base = example<{ user: { id: string } }>("resident.me.get");
    return HttpResponse.json({ id: crypto.randomUUID(), userId: base.user.id }, { status: 201 });
  }),
];
