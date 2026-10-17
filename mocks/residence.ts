/**
 * The resident's lease, deposit, usage, documents and privacy state in the mock API (L3). Shapes are the contract's
 * (`mocks/generated`, examples deep-copied and adjusted); fields and endpoints the contract does not publish yet are
 * added in `mocks/contract-requests.ts` and marked `// CONTRACT-REQUEST`.
 *
 * Scenario words in the fake LINE subject (`mocks/state.ts`) pick the starting state:
 *
 *   (default)   an active lease of A-201 (lessee) with its deposit held, IoT usage
 *   …signer…    the lease waits for my signature (D-062)
 *   …moveout…   notice given; the deposit settlement is proposed with deductions and photos (D-023)
 *   …manual…    meters read by hand: no usage series (D-063)
 *   …invitee…   nothing until an invitation is accepted (`OK…` → a unit; `SIGN…` → a lease to sign)
 */
import { createHash } from "node:crypto";

import type { components } from "../src/lib/api/schema";
import { example } from "./contract";
import { NOW, UNIT_A, type MockAccount } from "./state";
import { bangkokIso } from "./tokens";

type Schemas = components["schemas"];
export type Lease = Schemas["ResidentLeaseDto"];
export type Deposit = Schemas["ResidentDepositDto"];
export type Dsr = Schemas["DsrDto"];

export const MOCK_CONTRACT_SHA = "9c1185a5c5e9fc54612808977ee8f548b2258d31fd0b7a29b1b6c3e6a4f8e0a1";
export const SIGNATURE_OTP = "123456";

/** CONTRACT-REQUEST #8 / #10 / #11 state kept beside the contract shapes (docs/contract-requests.md). */
export interface MockLease {
  dto: Lease;
  rulesAcknowledgedAt: string | null;
}

export interface MockDocument {
  id: string;
  kind: "lease_contract" | "lease_notice" | "deposit_statement" | "receipt";
  title: string;
  createdAt: string;
  leaseId: string | null;
}

export interface NotificationPreference {
  topic: "billing" | "lease" | "service_requests" | "announcements" | "parcels";
  line: boolean;
  sms: boolean;
  /** Legally required notices (invoices, lease notices) cannot be switched off. */
  locked: boolean;
}

export interface MockResidence {
  leases: MockLease[];
  deposits: Deposit[];
  dsrs: Dsr[];
  documents: MockDocument[];
  preferences: NotificationPreference[];
  usage: "iot" | "manual";
  /** Signature OTP challenges: id → lease. */
  challenges: Map<string, { leaseId: string; attempts: number }>;
  /** Uploaded photos (CONTRACT-REQUEST #9): id → size. */
  uploads: Map<string, { contentType: string; bytes: number; done: boolean }>;
  /** Idempotent replays: `METHOD path key` → status + body. */
  replays: Map<string, { status: number; body: unknown }>;
}

const DAY = 86_400_000;

/** `YYYY-MM-DD` in Bangkok. */
export function bangkokDate(ms: number): string {
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** The earliest move-out date the API would accept: 30 days from today (ข้อ 4 (11)) — the API computes it. */
export function earliestNoticeDate(now = Date.now()): string {
  return bangkokDate(now + 30 * DAY);
}

/** A tiny SVG "photo" as a data URL (the contract's evidence links are 5-minute signed URLs). */
function photo(label: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240"><rect width="320" height="240" fill="hsl(${hue} 30% 85%)"/><text x="160" y="128" font-family="sans-serif" font-size="20" text-anchor="middle" fill="#333">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Lease ids are derived from the account's subject (and how many leases it already has), so a measured URL is
 * stable: Lighthouse signs in as `Ulighthouse-signer` and opens `/lease/<id>/sign` (lighthouse/resident.json).
 */
export function mockLeaseId(subject: string, index: number): string {
  const hex = createHash("sha256").update(`${subject}#${index}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function baseLease(account: MockAccount, status: Lease["status"]): Lease {
  const lease = example<Lease>("resident.leases.get");
  const id = mockLeaseId(account.subject, residenceOf(account).leases.length);
  const mine = lease.parties[0]!;
  return {
    ...lease,
    id,
    status,
    unitNo: UNIT_A.unitNo,
    buildingName: UNIT_A.buildingName,
    tenantId: UNIT_A.tenantId,
    tenantName: UNIT_A.tenantName,
    addendum: [
      {
        type: "house_rules",
        title: "ระเบียบอาคาร",
        text: "งดส่งเสียงดังหลัง 22:00 น. และทิ้งขยะที่จุดทิ้งขยะชั้น 1 เท่านั้น",
      },
      {
        type: "pets",
        title: "สัตว์เลี้ยง",
        text: "อนุญาตแมวได้ 1 ตัว ผู้เช่ารับผิดชอบความเสียหายที่เกิดจากสัตว์เลี้ยง",
      },
      { type: "smoking", title: "การสูบบุหรี่", text: "ห้ามสูบบุหรี่ภายในห้องและพื้นที่ส่วนกลาง" },
    ],
    lines: [
      ...lease.lines,
      {
        id: crypto.randomUUID(),
        kind: "parking",
        description: "ที่จอดรถยนต์ 1 คัน",
        amount: "500.00",
        recurrence: "monthly",
        effectiveFrom: lease.startDate,
      },
    ],
    parties: [
      {
        ...mine,
        partyId: crypto.randomUUID(),
        displayName: account.displayName,
        signedAt: status === "pending_signature" ? null : NOW,
      },
      {
        partyId: crypto.randomUUID(),
        displayName: "มานี ใจดี",
        role: "co_tenant",
        isSigner: false,
        signedAt: null,
      },
    ],
    signatureRequired: status === "pending_signature",
    nextActions: status === "pending_signature" ? ["view-contract", "sign"] : ["view-contract", "give-notice"],
    notice: null,
  };
}

function heldDeposit(lease: Lease): Deposit {
  const deposit = example<Deposit>("resident.deposits.get");
  return {
    ...deposit,
    id: crypto.randomUUID(),
    leaseId: lease.id,
    unitNo: lease.unitNo,
    status: "held",
    deductions: [],
    settlement: null,
    nextActions: [],
  };
}

function proposedDeposit(lease: Lease): Deposit {
  const deposit = example<Deposit>("resident.deposits.get");
  const wall = deposit.deductions[0]!;
  const cleaning = {
    ...wall,
    id: crypto.randomUUID(),
    kind: "cleaning" as const,
    amount: "350.50",
    description: "ล้างคราบน้ำมันในครัว",
    evidenceDocumentIds: [crypto.randomUUID()],
    evidenceUrls: [photo("หลังย้ายออก: ครัว", 30)],
  };
  const hole = {
    ...wall,
    id: crypto.randomUUID(),
    evidenceUrls: [photo("หลังย้ายออก: ผนัง", 200)],
  };
  const settlement = deposit.settlement!;
  return {
    ...deposit,
    id: crypto.randomUUID(),
    leaseId: lease.id,
    unitNo: lease.unitNo,
    status: "settling",
    deductions: [hole, cleaning],
    settlement: {
      ...settlement,
      deductionsTotal: "1150.50",
      proposedRefund: "3349.50",
      utilitiesFinal: "0.00",
      items: [hole, cleaning].map(({ evidenceUrls: _urls, ...item }) => item),
    },
    nextActions: ["accept", "dispute"],
  };
}

/** Before photos of the move-in inspection per deduction (CONTRACT-REQUEST #9: `beforeEvidenceUrls`). */
export const BEFORE_PHOTOS = new Map<string, string[]>();

function noticeOn(lease: Lease, effectiveDate: string): Lease {
  return {
    ...lease,
    status: "notice_given",
    nextActions: ["view-contract"],
    notice: {
      by: "lessee",
      effectiveDate,
      givenAt: bangkokIso(Date.now()),
      evidenceDocumentIds: [crypto.randomUUID()],
      reasonCode: "lessee_notice",
    },
  };
}

const holder = globalThis as typeof globalThis & { __gpMockResidences?: Map<string, MockResidence> };
holder.__gpMockResidences ??= new Map();
const residences = holder.__gpMockResidences;

export function residenceOf(account: MockAccount): MockResidence {
  const existing = residences.get(account.userId);
  if (existing) return existing;
  const has = (word: string) => account.subject.toLowerCase().includes(word);
  const residence: MockResidence = {
    leases: [],
    deposits: [],
    dsrs: [],
    documents: [],
    preferences: [
      { topic: "billing", line: true, sms: true, locked: true },
      { topic: "lease", line: true, sms: true, locked: true },
      { topic: "service_requests", line: true, sms: false, locked: false },
      { topic: "announcements", line: true, sms: false, locked: false },
      { topic: "parcels", line: true, sms: false, locked: false },
    ],
    usage: has("manual") ? "manual" : "iot",
    challenges: new Map(),
    uploads: new Map(),
    replays: new Map(),
  };
  // Registered first: building the leases below reads it (their ids count the leases already there).
  residences.set(account.userId, residence);
  if (!has("invitee")) {
    if (has("signer")) {
      residence.leases.push({ dto: baseLease(account, "pending_signature"), rulesAcknowledgedAt: null });
    } else if (has("moveout")) {
      const lease = noticeOn(baseLease(account, "active"), bangkokDate(Date.now() + 20 * DAY));
      residence.leases.push({ dto: lease, rulesAcknowledgedAt: NOW });
      const deposit = proposedDeposit(lease);
      residence.deposits.push(deposit);
      deposit.deductions.forEach((deduction, index) =>
        BEFORE_PHOTOS.set(deduction.id, [photo(index === 0 ? "ก่อนเข้าพัก: ผนัง" : "ก่อนเข้าพัก: ครัว", 120)]),
      );
    } else {
      const lease = baseLease(account, "active");
      residence.leases.push({ dto: lease, rulesAcknowledgedAt: null });
      residence.deposits.push(heldDeposit(lease));
    }
    for (const { dto } of residence.leases) {
      residence.documents.push({
        id: crypto.randomUUID(),
        kind: "lease_contract",
        title: `สัญญาเช่า ${dto.number ?? ""}`.trim(),
        createdAt: NOW,
        leaseId: dto.id,
      });
    }
  }
  return residence;
}

/** A pending lease for an invitee who accepted a `SIGN…` code. */
export function addPendingLease(account: MockAccount): Lease {
  const residence = residenceOf(account);
  const lease = baseLease(account, "pending_signature");
  residence.leases.push({ dto: lease, rulesAcknowledgedAt: null });
  return lease;
}

export function addActiveLease(account: MockAccount): Lease {
  const residence = residenceOf(account);
  const lease = baseLease(account, "active");
  residence.leases.push({ dto: lease, rulesAcknowledgedAt: null });
  residence.deposits.push(heldDeposit(lease));
  return lease;
}

export function giveNotice(lease: MockLease, effectiveDate: string, residence: MockResidence): void {
  lease.dto = noticeOn(lease.dto, effectiveDate);
  residence.documents.push({
    id: lease.dto.notice!.evidenceDocumentIds[0]!,
    kind: "lease_notice",
    title: `หนังสือบอกเลิกสัญญา ${lease.dto.number ?? ""}`.trim(),
    createdAt: bangkokIso(Date.now()),
    leaseId: lease.dto.id,
  });
}

/** Records my signature like the API: the lease waits for the lessor's countersignature (D-062). */
export function signLease(lease: MockLease): void {
  const now = bangkokIso(Date.now());
  lease.dto = {
    ...lease.dto,
    signatureRequired: false,
    nextActions: ["view-contract"],
    parties: lease.dto.parties.map((p) => (p.isSigner && p.role === "lessee" ? { ...p, signedAt: now } : p)),
  };
}

// ── usage (D-063, D-162) ────────────────────────────────────────────────────────────────────────

const HOUR = 3_600_000;

/** Deterministic per bucket, so a period and the same period fetched again agree. */
function usageAt(ms: number, utility: "electric" | "water", bucket: "1h" | "1d"): string {
  const index = Math.floor(ms / (bucket === "1d" ? DAY : HOUR));
  if (utility === "electric") {
    return bucket === "1d" ? (5 + ((index * 37) % 41) / 10).toFixed(3) : (0.1 + ((index * 17) % 30) / 100).toFixed(3);
  }
  return bucket === "1d"
    ? (0.12 + ((index * 13) % 19) / 100).toFixed(3)
    : (0.002 + ((index * 7) % 9) / 1000).toFixed(3);
}

export function usageSeries(
  residence: MockResidence,
  from: number,
  to: number,
  bucket: "15m" | "1h" | "1d",
): Schemas["UtilityUsageDto"][] {
  if (residence.usage === "manual") return [];
  const step = bucket === "1d" ? DAY : bucket === "1h" ? HOUR : 15 * 60_000;
  const size = bucket === "15m" ? "1h" : bucket;
  // Buckets start on Bangkok midnight (days) or the hour.
  const offset = 7 * HOUR;
  const first = Math.floor((from + offset) / step) * step - offset;
  const points = (utility: "electric" | "water") => {
    const out: Schemas["UsagePointDto"][] = [];
    for (let at = first; at < to && out.length < 800; at += step) {
      if (at < from) continue;
      out.push({ bucket: bangkokIso(at), usage: usageAt(at, utility, size) });
    }
    return out;
  };
  return [
    { utility: "electric", unit: "kwh", points: points("electric") },
    { utility: "water", unit: "m3", points: points("water") },
  ];
}
