/**
 * In-memory state of the mock API (mock builds only: `pnpm dev:mock`, e2e, Lighthouse). One "account" per LINE
 * subject or phone, one session per sign-in. Shapes follow the contract examples (`mocks/generated`); the
 * scenario words in a fake LINE subject pick the starting state, so parallel e2e tests never share an account:
 *
 *   …newcomer…  first sign-in: the consent purposes are unanswered (D-025)
 *   …multi…     two units in two buildings (unit switcher)
 *   …invitee…   no unit yet (accepts an invitation code) and consents unanswered
 *   …signer… / …moveout… / …manual…   lease, deposit and usage scenarios (`mocks/residence.ts`)
 *   …disabled…  the account is disabled (`auth.account_disabled`)
 */
import type { components } from "../src/lib/api/schema";

type Unit = components["schemas"]["ResidentUnitDto"];

export interface MockConsent {
  key: string;
  version: number;
  required: boolean;
  granted: boolean | null;
  grantedVersion: number | null;
  capturedAt: string | null;
}

export interface MockAccount {
  userId: string;
  subject: string;
  displayName: string;
  phone: string | null;
  lineLinked: boolean;
  language: components["schemas"]["ResidentLanguage"];
  units: Unit[];
  consents: MockConsent[];
  disabled: boolean;
  /** Invitation codes this account accepted (`POST /v1/resident/link`). */
  accepted: Set<string>;
}

export interface MockSession {
  sid: string;
  audience: "resident" | "technician";
  userId: string;
  /** The current refresh token; any older one of this session is "reused". */
  refreshToken: string;
  rotated: Set<string>;
  revoked: boolean;
}

export const UNIT_A: Unit = {
  buildingId: "5c8e2a1f-6b3d-4e7a-9f0c-1d2e3f4a5b6c",
  buildingName: "อาคาร A",
  role: "tenant",
  tenantId: "0d0c7a4e-5b0e-4c55-9d7c-3f2b8a1e6c11",
  tenantName: "หอพักตัวอย่าง",
  unitId: "3b241101-e2bb-4255-8caf-4136c566a962",
  unitNo: "A-201",
  validFrom: "2026-11-01",
};

export const UNIT_B: Unit = {
  buildingId: "7a1d3c5e-2f4b-4d6a-8c9e-0b1a2c3d4e5f",
  buildingName: "อาคาร B",
  role: "tenant",
  tenantId: "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b",
  tenantName: "แมนชั่นตัวอย่าง",
  unitId: "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a",
  unitNo: "B-105",
  validFrom: "2026-10-01",
};

/** The two resident purposes getproperty-api seeds (`prisma/seed/data/privacy.ts`), version 1. */
export const PURPOSES = {
  "resident.service": {
    required: true,
    th: {
      title: "การใช้ข้อมูลเพื่อให้บริการผู้พักอาศัย",
      body: "เราใช้ข้อมูลของคุณเพื่อออกบิลและแจ้งเตือน",
    },
    en: {
      title: "Use of data to provide the service",
      body: "The lessor (data controller) uses your data to manage the lease, invoices, payments and LINE notifications.",
    },
  },
  "resident.marketing": {
    required: false,
    th: { title: "ข่าวสารและข้อเสนอ", body: "รับข่าวสารและข้อเสนอจากผู้ให้เช่า (เลือกได้)" },
    en: { title: "News and offers", body: "Receive news and offers from the lessor (optional)." },
  },
} as const;

export const NOW = "2026-11-01T00:15:00+07:00";

/**
 * One store per server process, on `globalThis`: Next bundles the proxy and the route handlers separately, so a
 * module-level Map would give the proxy's refresh and the BFF two different mock APIs.
 */
interface MockStore {
  accounts: Map<string, MockAccount>;
  sessions: Map<string, MockSession>;
  refreshIndex: Map<string, string>;
  challenges: Map<string, { phone: string; attempts: number }>;
}
const holder = globalThis as typeof globalThis & { __gpMockStore?: MockStore };
holder.__gpMockStore ??= { accounts: new Map(), sessions: new Map(), refreshIndex: new Map(), challenges: new Map() };
const { accounts, sessions, refreshIndex, challenges } = holder.__gpMockStore;

export function nextId(): string {
  return crypto.randomUUID();
}

function consentsFor(answered: boolean): MockConsent[] {
  return Object.entries(PURPOSES).map(([key, purpose]) => ({
    key,
    version: 1,
    required: purpose.required,
    granted: answered ? purpose.required : null,
    grantedVersion: answered && purpose.required ? 1 : null,
    capturedAt: answered && purpose.required ? NOW : null,
  }));
}

export function accountFor(subject: string, init: { displayName: string; phone: string | null; lineLinked: boolean }) {
  const existing = accounts.get(subject);
  if (existing) return existing;
  const has = (word: string) => subject.toLowerCase().includes(word);
  const account: MockAccount = {
    userId: nextId(),
    subject,
    displayName: init.displayName,
    phone: init.phone,
    lineLinked: init.lineLinked,
    language: "th",
    units: has("invitee") ? [] : has("multi") ? [UNIT_A, UNIT_B] : [UNIT_A],
    consents: consentsFor(!(has("newcomer") || has("invitee"))),
    disabled: has("disabled"),
    accepted: new Set(),
  };
  accounts.set(subject, account);
  return account;
}

export function accountById(userId: string): MockAccount | undefined {
  for (const account of accounts.values()) if (account.userId === userId) return account;
  return undefined;
}

export function openSession(audience: MockSession["audience"], userId: string): MockSession {
  const session: MockSession = {
    sid: nextId(),
    audience,
    userId,
    refreshToken: `mock-rt.${crypto.randomUUID()}`,
    rotated: new Set(),
    revoked: false,
  };
  sessions.set(session.sid, session);
  refreshIndex.set(session.refreshToken, session.sid);
  return session;
}

export function sessionById(sid: string): MockSession | undefined {
  return sessions.get(sid);
}

/**
 * A refresh token that signs in on first use: `mock-rt.seed.<LINE sub>`. Lighthouse (`lighthouse/resident.json`)
 * sends it as a cookie so the proxy's refresh-before-render produces a real mock session without a browser
 * script. Mock builds only, like everything in `mocks/`.
 */
export const SEED_REFRESH_PREFIX = "mock-rt.seed.";
/** The same for a technician (`lighthouse/technician.json`): `mock-rt.seed-technician.<LINE sub>`. */
export const SEED_TECHNICIAN_REFRESH_PREFIX = "mock-rt.seed-technician.";

/** Single-use rotation like the API (D-163): a rotated token revokes the whole session. */
export function rotate(refreshToken: string): { session: MockSession } | { error: "invalid" | "reused" } {
  if (refreshToken.startsWith(SEED_TECHNICIAN_REFRESH_PREFIX)) {
    const sub = refreshToken.slice(SEED_TECHNICIAN_REFRESH_PREFIX.length);
    const account = accountFor(`line:${sub}`, { displayName: "ช่างสมชาย", phone: null, lineLinked: true });
    return rotate(openSession("technician", account.userId).refreshToken);
  }
  if (refreshToken.startsWith(SEED_REFRESH_PREFIX)) {
    const sub = refreshToken.slice(SEED_REFRESH_PREFIX.length);
    const account = accountFor(`line:${sub}`, { displayName: "สมชาย ใจดี", phone: null, lineLinked: true });
    const session = openSession("resident", account.userId);
    return rotate(session.refreshToken);
  }
  const sid = refreshIndex.get(refreshToken);
  const session = sid ? sessions.get(sid) : undefined;
  if (!session || session.revoked) return { error: "invalid" };
  if (session.refreshToken !== refreshToken) {
    session.revoked = true;
    return { error: "reused" };
  }
  session.rotated.add(refreshToken);
  session.refreshToken = `mock-rt.${crypto.randomUUID()}`;
  refreshIndex.set(session.refreshToken, session.sid);
  return { session };
}

export function revoke(refreshToken: string): void {
  const sid = refreshIndex.get(refreshToken);
  const session = sid ? sessions.get(sid) : undefined;
  if (session) session.revoked = true;
}

export function newChallenge(phone: string): string {
  const id = crypto.randomUUID();
  challenges.set(id, { phone, attempts: 0 });
  return id;
}

export function challenge(id: string) {
  return challenges.get(id);
}

export function dropChallenge(id: string): void {
  challenges.delete(id);
}
