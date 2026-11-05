import { describe, expect, it } from "vitest";

import type { ResidentVisit } from "@/lib/api/types";

import {
  bangkokInstant,
  canEditGate,
  checkPlate,
  clock,
  deepLinkStep,
  defaultWindow,
  gateUnit,
  parseAnswer,
  passUrl,
  plateText,
  policyLine,
  readPass,
  rememberDays,
  resultOf,
  secondsLeft,
  validateInvite,
  type InviteDraft,
} from "./model";

const visit: ResidentVisit = {
  id: "v1",
  gateId: "g1",
  gateName: "ป้อม 1",
  unitId: "u1",
  unitNo: "88/12",
  kind: "guest",
  state: "requested",
  entryBasis: null,
  plate: { category: "3กท", number: "8812", province: "กรุงเทพมหานคร" },
  visitorName: "คุณธนา",
  hasPhoto: true,
  respondBy: "2026-11-05T22:44:00+07:00",
  timeoutAction: "guard_calls",
  decidedAt: null,
  decisionReason: null,
  callMeAt: null,
  enteredAt: null,
  exitedAt: null,
  exitedBy: null,
  cancelledAt: null,
  createdAt: "2026-11-05T22:41:00+07:00",
  decidedByName: null,
  policy: {
    action: "guard_calls",
    custom: false,
    deliverySkipApproval: null,
    householdNote: null,
    timeoutSeconds: 180,
  },
  photoUrl: null,
};

const roles = (...r: string[]) => r.map((role) => ({ role })) as { role: "co_owner" }[];

describe("who sees and edits the gate", () => {
  it("shows the visitors tab on a juristic estate for gate roles, never payer-only or a rental", () => {
    expect(gateUnit({ legalForm: "land_allocation_act", roles: roles("co_owner") })).toBe(true);
    expect(gateUnit({ legalForm: "condo_act", roles: roles("family") })).toBe(true);
    expect(gateUnit({ legalForm: "condo_act", roles: roles("payer") })).toBe(false);
    expect(gateUnit({ legalForm: null, roles: roles("tenant") })).toBe(false);
    expect(gateUnit(null)).toBe(false);
  });

  it("the household edits (co-owner, tenant, co-tenant), family reads; the API's canEdit wins", () => {
    expect(canEditGate({ roles: roles("co_owner") })).toBe(true);
    expect(canEditGate({ roles: roles("co_tenant") })).toBe(true);
    expect(canEditGate({ roles: roles("family") })).toBe(false);
    expect(canEditGate({ roles: roles("family") }, true)).toBe(true);
    expect(canEditGate({ roles: roles("co_owner") }, false)).toBe(false);
  });
});

describe("countdown and the house policy line", () => {
  it("counts whole seconds down to respondBy, never below zero", () => {
    const now = Date.parse("2026-11-05T22:43:12.200+07:00");
    expect(secondsLeft(visit.respondBy, now)).toBe(48);
    expect(clock(48)).toBe("0:48");
    expect(clock(180)).toBe("3:00");
    expect(secondsLeft(visit.respondBy, Date.parse("2026-11-05T23:00:00+07:00"))).toBe(0);
    expect(secondsLeft(null, now)).toBeNull();
  });

  it("names the house policy from the visit: action snapshot, minutes from the clock", () => {
    expect(policyLine(visit)).toEqual({ action: "guard_calls", minutes: 3 });
    expect(policyLine({ ...visit, timeoutAction: "allow_and_log" })).toEqual({ action: "allow_and_log", minutes: 3 });
    expect(
      policyLine({
        ...visit,
        timeoutAction: null,
        respondBy: null,
        policy: { ...visit.policy, action: "deny", timeoutSeconds: 300 },
      }),
    ).toEqual({ action: "deny", minutes: 5 });
    expect(policyLine({ ...visit, respondBy: "2026-11-05T22:41:20+07:00" }).minutes).toBe(1);
  });

  it("reads the remember-days extra only when the API sends it (contract request #50)", () => {
    expect(rememberDays({ rememberDays: 30 })).toBe(30);
    expect(rememberDays({})).toBeNull();
    expect(rememberDays({ rememberDays: "30" })).toBeNull();
  });
});

describe("result card", () => {
  it("who answered and when; someone else first; timeout says what the policy did", () => {
    const approved = {
      ...visit,
      state: "approved" as const,
      decidedByName: "คุณวิภา",
      decidedAt: "2026-11-05T22:42:00+07:00",
    };
    expect(resultOf(approved)).toMatchObject({ kind: "approved", by: "คุณวิภา", someoneElse: false });
    expect(resultOf(approved, false).someoneElse).toBe(true);
    expect(resultOf({ ...visit, state: "timed_out", decidedAt: "x", timeoutAction: "allow_and_log" })).toMatchObject({
      kind: "timed_out",
      by: null,
      policy: "allow_and_log",
    });
    expect(resultOf({ ...visit, state: "entered", enteredAt: "e" })).toMatchObject({ kind: "entered", at: "e" });
    expect(resultOf({ ...visit, callMeAt: "c" })).toMatchObject({ kind: "call_me", at: "c" });
    expect(resultOf(visit).kind).toBe("waiting");
  });
});

describe("deep-linked answers", () => {
  it("parses only the three answers", () => {
    expect(parseAnswer("approve")).toBe("approve");
    expect(parseAnswer(["call_me", "deny"])).toBe("call_me");
    expect(parseAnswer("approve;drop")).toBeNull();
    expect(parseAnswer(undefined)).toBeNull();
  });

  it("never acts on arrival: confirm while waiting, the result once answered", () => {
    expect(deepLinkStep("approve", "requested")).toBe("confirm");
    expect(deepLinkStep("deny", "approved")).toBe("answered");
    expect(deepLinkStep(null, "requested")).toBeNull();
  });
});

describe("plates", () => {
  it("formats and checks like the API", () => {
    expect(plateText(visit.plate)).toBe("3กท 8812");
    expect(checkPlate({ category: "", number: "", province: "" })).toEqual({ plate: null });
    expect(checkPlate({ category: "", number: "", province: "" }, true)).toMatchObject({ error: "partial" });
    expect(checkPlate({ category: "1 กข", number: "12-34", province: " ชลบุรี " })).toEqual({
      plate: { category: "1กข", number: "1234", province: "ชลบุรี" },
    });
    expect(checkPlate({ category: "123", number: "1", province: "x" })).toMatchObject({ field: "category" });
    expect(checkPlate({ category: "กข", number: "12345", province: "x" })).toMatchObject({ field: "number" });
    expect(checkPlate({ category: "กข", number: "12", province: "" })).toMatchObject({ field: "province" });
  });
});

describe("invite validation", () => {
  const now = Date.parse("2026-11-06T08:00:00+07:00");
  const draft: InviteDraft = {
    visitorKind: "guest",
    usage: "single",
    fromDate: "2026-11-06",
    fromTime: "09:00",
    toDate: "2026-11-06",
    toTime: "18:00",
    maxUses: "10",
    visitorName: " คุณแม่ ",
    note: "",
    plateCategory: "",
    plateNumber: "",
    plateProvince: "",
  };

  it("builds the body in Bangkok time, trimmed, without empty extras", () => {
    const { errors, body } = validateInvite(draft, now);
    expect(errors).toEqual({});
    expect(body).toEqual({
      usage: "single",
      visitorKind: "guest",
      validFrom: "2026-11-06T09:00:00+07:00",
      validTo: "2026-11-06T18:00:00+07:00",
      visitorName: "คุณแม่",
    });
  });

  it("refuses a window out of order or already over", () => {
    expect(validateInvite({ ...draft, toTime: "08:30", fromTime: "09:00" }, now).errors).toEqual({ toDate: "order" });
    expect(validateInvite({ ...draft, fromTime: "06:00", toTime: "07:00" }, now).errors).toEqual({ toDate: "past" });
    expect(validateInvite({ ...draft, fromDate: "" }, now).errors.fromDate).toBe("required");
  });

  it("multi-use takes 2–100 uses", () => {
    expect(validateInvite({ ...draft, usage: "multi", maxUses: "1" }, now).errors).toEqual({ maxUses: "range" });
    expect(validateInvite({ ...draft, usage: "multi", maxUses: "2.5" }, now).errors).toEqual({ maxUses: "range" });
    expect(validateInvite({ ...draft, usage: "multi", maxUses: "100" }, now).body?.maxUses).toBe(100);
    // Single use never sends maxUses.
    expect(validateInvite({ ...draft, maxUses: "abc" }, now).body?.maxUses).toBeUndefined();
  });

  it("a full plate or none; name and note within the contract", () => {
    expect(validateInvite({ ...draft, plateCategory: "กข" }, now).errors).toEqual({ plateNumber: "number" });
    expect(
      validateInvite({ ...draft, plateCategory: "กข", plateNumber: "1234", plateProvince: "ชลบุรี" }, now).body?.plate,
    ).toEqual({ category: "กข", number: "1234", province: "ชลบุรี" });
    expect(validateInvite({ ...draft, visitorName: "ก".repeat(121) }, now).errors).toEqual({ visitorName: "tooLong" });
    expect(validateInvite({ ...draft, note: "ก".repeat(301) }, now).errors).toEqual({ note: "tooLong" });
  });

  it("defaults to the next quarter hour for four hours, and keeps instants valid", () => {
    expect(defaultWindow(Date.parse("2026-11-06T09:07:00+07:00"))).toEqual({
      fromDate: "2026-11-06",
      fromTime: "09:15",
      toDate: "2026-11-06",
      toTime: "13:15",
    });
    expect(bangkokInstant("2026-11-06", "25:00")).toBeNull();
  });
});

describe("the pass link", () => {
  it("keeps the token in the fragment and reads it back", () => {
    const url = passUrl("https://app.example", { token: "gpv1.abcDEF_12-xyz", unit: "88/12", from: "a", to: "b" });
    expect(url.startsWith("https://app.example/pass#t=gpv1.")).toBe(true);
    expect(readPass(new URL(url).hash)).toEqual({
      token: "gpv1.abcDEF_12-xyz",
      unit: "88/12",
      from: "a",
      to: "b",
      place: null,
    });
    expect(readPass("#t=nope")).toBeNull();
  });
});
