/**
 * MSW handlers for the contract operations this app uses (resident, technician and their auth). Stateful where
 * a flow needs it (sign-in, refresh rotation, consents); every other operation answers with the contract's
 * example. Bodies come from `mocks/generated` (`pnpm gen:api`); endpoints the contract lacks live in
 * `mocks/contract-requests.ts`, marked `// CONTRACT-REQUEST`.
 */
import { http, HttpResponse, type HttpHandler } from "msw";

import type { components } from "../src/lib/api/schema";
import { readFakeLineIdToken } from "../src/lib/liff/fakeLineToken";
import { example, GENERATED_OPERATIONS, mswPath, problem, problemResponse } from "./contract";
import {
  accountById,
  accountFor,
  challenge,
  dropChallenge,
  newChallenge,
  openSession,
  PURPOSES,
  revoke,
  rotate,
  sessionById,
  type MockAccount,
  type MockSession,
} from "./state";
import { residenceOf } from "./residence";
import { bangkokIso, mockAccessToken, readMockAccessToken, TTL } from "./tokens";

type Schemas = components["schemas"];

export const OTP_CODE = "123456";
export const OTP_EXPIRED_CODE = "000000";
const OTP_MAX_ATTEMPTS = 5;

/** Resident menu entitlements of the mock (`ResidentMeDto.entitlements`); `…manual…` accounts have no IoT usage. */
export const MOCK_ENTITLEMENTS = ["bills", "usage", "lease"] as const;

function tokenPair(session: MockSession, account: MockAccount, now = Date.now()): Schemas["TokenPairDto"] {
  const base = example<Schemas["TokenPairDto"]>("auth.residentLine.exchange");
  const access = mockAccessToken({ sub: account.userId, aud: session.audience, sid: session.sid }, now);
  return {
    ...base,
    accessToken: access.token,
    accessTokenExpiresAt: bangkokIso(access.exp * 1000),
    refreshToken: session.refreshToken,
    refreshTokenExpiresAt: bangkokIso(now + TTL.refresh * 1000),
    subject: {
      ...base.subject,
      audience: session.audience,
      id: account.userId,
      scopes: account.units.map((u) => `unit:${u.unitId}`),
    },
  };
}

type Authenticated = { account: MockAccount; session: MockSession };

/** Bearer check like the API's audience guard: no/invalid token → 401, other audience → 403. */
export function authenticate(
  request: Request,
  audience: MockSession["audience"],
  operationId: string,
): Authenticated | Response {
  const header = request.headers.get("authorization") ?? "";
  const claims = header.startsWith("Bearer ") ? readMockAccessToken(header.slice(7)) : null;
  const session = claims ? sessionById(claims.sid) : undefined;
  const account = claims ? accountById(claims.sub) : undefined;
  if (!claims || !session || session.revoked || !account) return problem(operationId, "auth.unauthenticated");
  if (claims.aud !== audience) return problem(operationId, "auth.wrong_audience");
  return { account, session };
}

function languageOf(request: Request): "th" | "en" {
  return (request.headers.get("accept-language") ?? "th").toLowerCase().startsWith("en") ? "en" : "th";
}

function consentComplete(account: MockAccount): boolean {
  return account.consents.every((c) => !c.required || (c.granted === true && c.grantedVersion === c.version));
}

export function residentMe(account: MockAccount): Schemas["ResidentMeDto"] {
  const base = example<Schemas["ResidentMeDto"]>("resident.me.get");
  const residence = residenceOf(account);
  const leases = residence.leases.map(({ dto }) => ({
    leaseId: dto.id,
    number: dto.number,
    status: dto.status,
    role: "lessee" as const,
    unitNo: dto.unitNo,
    buildingName: dto.buildingName,
    tenantId: dto.tenantId,
    tenantName: dto.tenantName,
  }));
  return {
    ...base,
    consentComplete: consentComplete(account),
    consents: account.consents.map((c) => ({
      granted: c.granted === true && c.grantedVersion === c.version,
      purposeKey: c.key,
      required: c.required,
      version: c.version,
    })),
    scopes: [...account.units.map((u) => `unit:${u.unitId}`), ...leases.map((l) => `lease:${l.leaseId}`)],
    units: account.units,
    leases,
    leaseIds: leases.map((l) => l.leaseId),
    user: {
      ...base.user,
      id: account.userId,
      displayName: account.displayName,
      // The phone the office recorded on the party (shown in the profile, used for the signature OTP).
      phone: account.phone ?? (account.units.length ? base.user.phone : null),
      language: account.language,
      lineLinked: account.lineLinked,
    },
    entitlements: MOCK_ENTITLEMENTS.filter((e) => e !== "usage" || residence.usage === "iot"),
  };
}

export function purposesFor(account: MockAccount, language: "th" | "en"): Schemas["ConsentPurposeDto"][] {
  const base = example<Schemas["ConsentPurposeDto"][]>("resident.consents.list")[0]!;
  return account.consents.map((c) => {
    const text = PURPOSES[c.key as keyof typeof PURPOSES][language];
    return {
      ...base,
      key: c.key,
      required: c.required,
      version: c.version,
      language,
      title: text.title,
      bodyMarkdown: text.body,
      granted: c.grantedVersion === c.version ? c.granted : null,
      grantedVersion: c.grantedVersion,
      capturedAt: c.capturedAt,
    };
  });
}

async function json<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

function lineExchange(audience: MockSession["audience"], operationId: string) {
  return http.post(mswPath(`/v1/auth/${audience}/line`), async ({ request }) => {
    const body = await json<{ idToken?: unknown }>(request);
    if (!body || typeof body.idToken !== "string") return problem(operationId, "validation.failed");
    const claims = readFakeLineIdToken(body.idToken);
    if (!claims) return problem(operationId, "auth.line_token_invalid");
    const account = accountFor(`line:${claims.sub}`, { displayName: claims.name, phone: null, lineLinked: true });
    if (account.disabled) return problem(operationId, "auth.account_disabled");
    return HttpResponse.json(tokenPair(openSession(audience, account.userId), account));
  });
}

const THAI_MOBILE = /^(?:\+66|0)([689]\d{8})$/;

export const contractHandlers: HttpHandler[] = [
  lineExchange("resident", "auth.residentLine.exchange"),
  lineExchange("technician", "auth.technicianLine.exchange"),

  http.post(mswPath("/v1/auth/resident/otp/request"), async ({ request }) => {
    const body = await json<{ phone?: unknown }>(request);
    const phone = typeof body?.phone === "string" ? body.phone.replace(/[\s-]/g, "") : "";
    const match = THAI_MOBILE.exec(phone);
    if (!match) return problem("auth.residentOtp.request", "validation.failed");
    const now = Date.now();
    return HttpResponse.json({
      challengeId: newChallenge(`+66${match[1]}`),
      expiresAt: bangkokIso(now + 5 * 60_000),
      resendAvailableAt: bangkokIso(now + 60_000),
    } satisfies Schemas["OtpChallengeDto"]);
  }),

  http.post(mswPath("/v1/auth/resident/otp/verify"), async ({ request }) => {
    const op = "auth.residentOtp.verify";
    const body = await json<{ challengeId?: unknown; code?: unknown }>(request);
    if (typeof body?.challengeId !== "string" || typeof body.code !== "string") return problem(op, "validation.failed");
    const pending = challenge(body.challengeId);
    if (!pending || body.code === OTP_EXPIRED_CODE) return problem(op, "auth.otp_expired");
    if (body.code !== OTP_CODE) {
      pending.attempts += 1;
      if (pending.attempts >= OTP_MAX_ATTEMPTS) {
        dropChallenge(body.challengeId);
        return problem(op, "auth.otp_attempts_exceeded");
      }
      return problem(op, "auth.otp_invalid", { attemptsRemaining: OTP_MAX_ATTEMPTS - pending.attempts });
    }
    dropChallenge(body.challengeId);
    const base = example<Schemas["ResidentMeDto"]>("resident.me.get");
    const account = accountFor(`phone:${pending.phone}`, {
      displayName: base.user.displayName,
      phone: pending.phone,
      lineLinked: false,
    });
    if (account.disabled) return problem(op, "auth.account_disabled");
    return HttpResponse.json(tokenPair(openSession("resident", account.userId), account));
  }),

  http.post(mswPath("/v1/auth/refresh"), async ({ request }) => {
    const op = "auth.sessions.refresh";
    const body = await json<{ refreshToken?: unknown }>(request);
    if (typeof body?.refreshToken !== "string") return problem(op, "validation.failed");
    const result = rotate(body.refreshToken);
    if ("error" in result)
      return problem(op, result.error === "reused" ? "auth.refresh_reused" : "auth.refresh_invalid");
    const account = accountById(result.session.userId)!;
    return HttpResponse.json(tokenPair(result.session, account));
  }),

  http.post(mswPath("/v1/auth/logout"), async ({ request }) => {
    const body = await json<{ refreshToken?: unknown }>(request);
    if (typeof body?.refreshToken === "string") revoke(body.refreshToken);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(mswPath("/v1/resident/me"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.me.get");
    if (auth instanceof Response) return auth;
    return HttpResponse.json(residentMe(auth.account));
  }),

  http.get(mswPath("/v1/resident/consents"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.consents.list");
    if (auth instanceof Response) return auth;
    return HttpResponse.json(purposesFor(auth.account, languageOf(request)));
  }),

  http.post(mswPath("/v1/resident/consents"), async ({ request }) => {
    const op = "resident.consents.capture";
    const auth = authenticate(request, "resident", op);
    if (auth instanceof Response) return auth;
    const body = await json<Schemas["ConsentCaptureDto"]>(request);
    if (!body || !Array.isArray(body.items) || body.items.length === 0) return problem(op, "validation.failed");
    for (const item of body.items) {
      if (!auth.account.consents.some((c) => c.key === item.purposeKey)) return problem(op, "consent.unknown_purpose");
    }
    const capturedAt = bangkokIso(Date.now());
    for (const item of body.items) {
      const consent = auth.account.consents.find((c) => c.key === item.purposeKey)!;
      consent.granted = item.granted;
      consent.grantedVersion = item.version;
      consent.capturedAt = capturedAt;
    }
    return HttpResponse.json(
      { recorded: body.items.length, purposes: purposesFor(auth.account, languageOf(request)) },
      { status: 201 },
    );
  }),

  http.get(mswPath("/v1/technician/me"), ({ request }) => {
    const auth = authenticate(request, "technician", "technician.me.get");
    if (auth instanceof Response) return auth;
    const base = example<Schemas["TechnicianMeDto"]>("technician.me.get");
    return HttpResponse.json({
      ...base,
      user: { ...base.user, id: auth.account.userId, displayName: auth.account.displayName },
    });
  }),

  http.post(mswPath("/v1/resident/realtime/auth"), ({ request }) => {
    const auth = authenticate(request, "resident", "resident.realtime.auth");
    if (auth instanceof Response) return auth;
    const base = example<Schemas["RealtimeAuthDto"]>("resident.realtime.auth");
    const streamToken = `mock-stream.${auth.session.sid}`;
    return HttpResponse.json({
      ...base,
      channels: [`user:${auth.account.userId}`],
      streamToken,
      streamUrl: `/v1/resident/realtime/stream?token=${streamToken}`,
      expiresAt: bangkokIso(Date.now() + 60_000),
    });
  }),

  http.get(mswPath("/v1/resident/realtime/stream"), ({ request }) => {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    const session = sessionById(token.replace(/^mock-stream\./, ""));
    if (!session) return problem("resident.realtime.stream", "realtime.token_invalid");
    const encoder = new TextEncoder();
    let timer: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(`event: ready\ndata: ${JSON.stringify({ channels: [`user:${session.userId}`] })}\n\n`),
        );
        timer = setInterval(() => controller.enqueue(encoder.encode("event: heartbeat\ndata: {}\n\n")), 25_000);
      },
      cancel() {
        clearInterval(timer);
      },
    });
    return new HttpResponse(stream, {
      headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
    });
  }),
];

/**
 * Every other contract operation of the resident/technician surfaces: authenticate, then answer with the
 * contract's success example. Registered after the stateful handlers, so those win.
 */
export const exampleHandlers: HttpHandler[] = GENERATED_OPERATIONS.filter((op) =>
  /^\/v1\/(resident|technician)\//.test(op.path),
).map((op) => {
  const method = op.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
  return http[method](mswPath(op.path), ({ request }) => {
    const audience = op.path.startsWith("/v1/technician/") ? "technician" : "resident";
    const isPing = op.operationId.endsWith(".system.ping");
    if (!isPing) {
      const auth = authenticate(request, audience, op.operationId);
      if (auth instanceof Response) return auth;
    }
    if (op.success.status === 204 || op.success.example === null) return new HttpResponse(null, { status: 204 });
    return HttpResponse.json(structuredClone(op.success.example), { status: op.success.status });
  });
});

export { problemResponse };
