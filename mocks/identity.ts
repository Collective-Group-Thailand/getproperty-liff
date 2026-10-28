/**
 * Identity verification (D-267, api B7.10 part 2) for residents and prospects, like getproperty-api's fake e-KYC
 * (O-021): starting opens a session at the provider (`https://ekyc.example.test/session/{id}` — the e2e suite stands
 * in for that page); a pending attempt is answered again; approved once = verified. The provider's decision arrives
 * with the `gp_mock` cookie `ekyc.decide=approved|rejected` (sent as `x-gp-mock`) on the next read — the in-process
 * mock has no webhook to call.
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { mswPath, problem } from "./contract";
import { authenticate } from "./handlers";

type Schemas = components["schemas"];
type Attempt = Schemas["IdentityVerificationAttemptDto"];
type Audience = "resident" | "prospect";

const holder = globalThis as typeof globalThis & { __gpMockIdentity?: Map<string, Attempt[]> };
holder.__gpMockIdentity ??= new Map();
const byUser = holder.__gpMockIdentity;

export const MOCK_EKYC_ORIGIN = "https://ekyc.example.test";

function decision(request: Request): "approved" | "rejected" | null {
  for (const pair of (request.headers.get("x-gp-mock") ?? "").split(";")) {
    const [key, value] = pair.split("=").map((s) => s.trim());
    if (key === "ekyc.decide" && (value === "approved" || value === "rejected")) return value;
  }
  return null;
}

function attemptsOf(userId: string, request: Request): Attempt[] {
  const attempts = byUser.get(userId) ?? [];
  byUser.set(userId, attempts);
  const decided = decision(request);
  const pending = attempts.find((a) => a.state === "pending");
  if (decided && pending) {
    pending.state = decided;
    pending.verificationUrl = null;
    pending.failureReason = decided === "rejected" ? "The ID card photo could not be read (fake provider)." : null;
  }
  return attempts;
}

function status(attempts: Attempt[]): Schemas["IdentityVerificationDto"] {
  const approved = attempts.find((a) => a.state === "approved");
  return {
    verified: Boolean(approved),
    verifiedAt: approved?.createdAt ?? null,
    available: true,
    latest: attempts[0] ?? null,
  };
}

function handlers(audience: Audience): HttpHandler[] {
  const path = mswPath(`/v1/${audience}/me/identity-verification`);
  return [
    http.get(path, ({ request }) => {
      const auth = authenticate(request, audience, `${audience}.identityVerification.get`);
      if (auth instanceof Response) return auth;
      return HttpResponse.json(status(attemptsOf(auth.account.userId, request)));
    }),
    http.post(path, ({ request }) => {
      const op = `${audience}.identityVerification.start`;
      const auth = authenticate(request, audience, op);
      if (auth instanceof Response) return auth;
      const attempts = attemptsOf(auth.account.userId, request);
      const current = status(attempts);
      if (current.verified) return problem(op, "identity.already_verified");
      if (current.latest?.state !== "pending") {
        const id = crypto.randomUUID();
        attempts.unshift({
          id,
          state: "pending",
          verificationUrl: `${MOCK_EKYC_ORIGIN}/session/fake-ekyc-${id}`,
          failureReason: null,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
        });
      }
      return HttpResponse.json(status(attempts));
    }),
  ];
}

export const identityHandlers: HttpHandler[] = [...handlers("resident"), ...handlers("prospect")];

/** Whether the login has an approved attempt (self-viewing requirements, GL2 / D-295). */
export function identityVerifiedOf(userId: string): boolean {
  return (byUser.get(userId) ?? []).some((a) => a.state === "approved");
}

/** Seeds an approved attempt (mock accounts that start verified, e.g. the Lighthouse self-viewing prospect). */
export function seedIdentityVerified(userId: string): void {
  if (identityVerifiedOf(userId)) return;
  const attempts = byUser.get(userId) ?? [];
  byUser.set(userId, attempts);
  const at = new Date(Date.now() - 86_400_000).toISOString();
  attempts.unshift({
    id: crypto.randomUUID(),
    state: "approved",
    verificationUrl: null,
    failureReason: null,
    createdAt: at,
    expiresAt: at,
  });
}
