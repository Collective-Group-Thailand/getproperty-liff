// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createBffHandler } from "../src/lib/bff/handler";
import { fakeLineIdToken } from "../src/lib/liff/fakeLineToken";
import { handleMockRequest } from "./server";
import { ESTATE_POINT } from "./gate";
import { CONDO_UNIT, VILLAGE_UNIT } from "./state";

const APP = "https://app.example";
const API = "http://mock-api.invalid";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON bodies of the mock API
type Body = any;

/** One resident's browser over the BFF and the mock API (cookie jar), as in `mocks.test.ts`. */
function browser() {
  const jar = new Map<string, string>();
  const bff = createBffHandler({
    apiBaseUrl: API,
    upstream: handleMockRequest,
    technicianEnabled: false,
    appOrigin: APP,
  });
  return {
    async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
      const h = new Headers(headers);
      h.set("cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
      if (method !== "GET") {
        h.set("origin", APP);
        h.set("x-getproperty-csrf", "1");
        h.set("content-type", "application/json");
      }
      const response = await bff(
        new Request(`${APP}/bff${path}`, {
          method,
          headers: h,
          body: body === undefined ? undefined : JSON.stringify(body),
        }),
      );
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(";");
        const name = pair!.slice(0, pair!.indexOf("="));
        if (/Max-Age=0/.test(line)) jar.delete(name);
        else jar.set(name, decodeURIComponent(pair!.slice(pair!.indexOf("=") + 1)));
      }
      const text = await response.text();
      return { status: response.status, body: (text ? JSON.parse(text) : null) as Body };
    },
    signIn(sub: string) {
      return this.call("POST", "/auth/line", { idToken: fakeLineIdToken({ sub, name: "ทดสอบ" }) });
    },
  };
}

const V = VILLAGE_UNIT.unitId;
const idem = () => ({ "idempotency-key": crypto.randomUUID() });

describe("JL4 mock: visitors, gate, SOS", () => {
  it("a waiting visitor: first answer wins, a later one sees who answered (accepted: false)", async () => {
    const b = browser();
    await b.signIn("Umock-jl4-village-visitor");
    const list = (await b.call("GET", `/v1/resident/visits?unitId=${V}&state=requested`)).body.data;
    expect(list).toHaveLength(1);
    const visit = (await b.call("GET", `/v1/resident/visits/${list[0].id}`)).body;
    expect(visit).toMatchObject({
      state: "requested",
      timeoutAction: "guard_calls",
      gateName: "ป้อม 1",
      hasPhoto: true,
    });
    const gate = (await b.call("GET", `/v1/resident/units/${V}/gate`)).body;
    expect(gate).toMatchObject({ rememberDays: 30, inviteMaxDays: 30 });
    await b.call("POST", `/v1/resident/__mock/visits/${visit.id}/answer`, { answer: "approve", name: "คุณวิภา" });
    const late = await b.call("POST", `/v1/resident/visits/${visit.id}/actions/deny`, {}, idem());
    expect(late.body.accepted).toBe(false);
    expect(late.body.visit).toMatchObject({ state: "approved", decidedByName: "คุณวิภา" });
  });

  it("approve remembers the car when asked; call-me decides nothing", async () => {
    const b = browser();
    await b.signIn("Umock-jl4-village-quietgate");
    const created = (await b.call("POST", `/v1/resident/__mock/units/${V}/visits`, { photo: false })).body;
    const call = await b.call("POST", `/v1/resident/visits/${created.id}/actions/call-me`, {}, idem());
    expect(call.body).toMatchObject({ accepted: true, visit: { state: "requested" } });
    expect(call.body.visit.callMeAt).toBeTruthy();
    const ok = await b.call(
      "POST",
      `/v1/resident/visits/${created.id}/actions/approve`,
      { rememberVehicle: true },
      idem(),
    );
    expect(ok.body).toMatchObject({ accepted: true, visit: { state: "approved", decidedByName: "ทดสอบ" } });
    const remembered = (await b.call("GET", `/v1/resident/units/${V}/remembered-vehicles`)).body;
    expect(remembered.map((r: Body) => r.plate.number)).toEqual(["8812"]);
  });

  it("house policy and cars: the household edits, family reads", async () => {
    const owner = browser();
    await owner.signIn("Umock-jl4-village");
    expect((await owner.call("GET", `/v1/resident/units/${V}/gate`)).body).toMatchObject({
      canEdit: true,
      gates: [{}, {}],
    });
    const put = await owner.call("PUT", `/v1/resident/units/${V}/gate-policy`, {
      timeoutSeconds: 300,
      action: "allow_and_log",
    });
    expect(put.body.policy).toMatchObject({ timeoutSeconds: 300, action: "allow_and_log", custom: true });
    expect((await owner.call("PUT", `/v1/resident/units/${V}/gate-policy`, { timeoutSeconds: 30 })).status).toBe(422);

    const family = browser();
    await family.signIn("Umock-jl4-housefamily");
    const units = (await family.call("GET", "/v1/resident/me/units")).body.units;
    expect(units[0]).toMatchObject({ unitNo: "88/12", propertyKind: "village", legalForm: "land_allocation_act" });
    expect(units[0].capabilities).toContain("gate");
    expect((await family.call("GET", `/v1/resident/units/${V}/gate`)).body.canEdit).toBe(false);
    expect((await family.call("PUT", `/v1/resident/units/${V}/gate-policy`, { timeoutSeconds: 120 })).status).toBe(403);
    const car = { plate: { category: "กข", number: "12", province: "ชลบุรี" } };
    expect((await family.call("POST", `/v1/resident/units/${V}/vehicles`, car, idem())).status).toBe(403);
    expect((await owner.call("POST", `/v1/resident/units/${V}/vehicles`, car, idem())).status).toBe(201);
    expect((await owner.call("POST", `/v1/resident/units/${V}/vehicles`, car, idem())).status).toBe(409);
  });

  it("the gate capability (CR #49) and one pass by id (CR #52)", async () => {
    const none = browser();
    await none.signIn("Umock-jl4-village-nogate");
    const [unit] = (await none.call("GET", "/v1/resident/me/units")).body.units;
    expect(unit.capabilities).not.toContain("gate");
    expect((await none.call("GET", `/v1/resident/units/${V}/gate`)).status).toBe(404);

    const b = browser();
    await b.signIn("Umock-jl4-village");
    const start = Date.now() + 3_600_000;
    const created = await b.call(
      "POST",
      `/v1/resident/units/${V}/visit-invites`,
      {
        usage: "single",
        visitorKind: "guest",
        validFrom: new Date(start).toISOString(),
        validTo: new Date(start + 3_600_000).toISOString(),
      },
      idem(),
    );
    const one = await b.call("GET", `/v1/resident/units/${V}/visit-invites/${created.body.id}`);
    expect(one.body).toMatchObject({ id: created.body.id, state: "active" });
    expect(one.body.token).toBeUndefined();
    expect((await b.call("GET", `/v1/resident/units/${V}/visit-invites/${crypto.randomUUID()}`)).status).toBe(404);
  });

  it("invites: token once, contractor waits for the office, window ≤ 30 days, revoke", async () => {
    const b = browser();
    await b.signIn("Umock-jl4-village-quietgate");
    const from = new Date(Date.now() + 3_600_000).toISOString();
    const to = new Date(Date.now() + 5 * 3_600_000).toISOString();
    const made = await b.call(
      "POST",
      `/v1/resident/units/${V}/visit-invites`,
      { usage: "single", visitorKind: "guest", validFrom: from, validTo: to },
      idem(),
    );
    expect(made.status).toBe(201);
    expect(made.body.token).toMatch(/^gpv1\./);
    const listed = (await b.call("GET", `/v1/resident/units/${V}/visit-invites`)).body;
    expect(listed[0].token).toBeUndefined();
    const contractor = await b.call(
      "POST",
      `/v1/resident/units/${V}/visit-invites`,
      { usage: "multi", maxUses: 3, visitorKind: "contractor", validFrom: from, validTo: to },
      idem(),
    );
    expect(contractor.body.state).toBe("pending_approval");
    const far = new Date(Date.now() + 40 * 86_400_000).toISOString();
    const long = await b.call(
      "POST",
      `/v1/resident/units/${V}/visit-invites`,
      { usage: "single", visitorKind: "guest", validFrom: from, validTo: far },
      idem(),
    );
    expect(long.body.code).toBe("visit_invite.window_too_long");
    const revoked = await b.call(
      "POST",
      `/v1/resident/units/${V}/visit-invites/${made.body.id}/actions/revoke`,
      {},
      idem(),
    );
    expect(revoked.body.state).toBe("revoked");
  });

  it("opening the barrier: own car only, 3-s interval, geofence when asked, switched off", async () => {
    const b = browser();
    await b.signIn("Umock-jl4-village-mycar");
    const gates = (await b.call("GET", "/v1/resident/gates")).body;
    expect(gates).toHaveLength(2);
    const [gate] = gates;
    expect(gate).toMatchObject({ enabled: true, requireGeofence: false });
    const vehicleId = gate.vehicles[0].id;
    expect((await b.call("POST", `/v1/resident/gates/${gate.gateId}/actions/open`, { vehicleId }, idem())).status).toBe(
      202,
    );
    const again = await b.call("POST", `/v1/resident/gates/${gate.gateId}/actions/open`, { vehicleId }, idem());
    expect(again.body.code).toBe("gate.open_rate_limited");
    expect(
      (
        await b.call(
          "POST",
          `/v1/resident/gates/${gate.gateId}/actions/open`,
          { vehicleId: crypto.randomUUID() },
          idem(),
        )
      ).status,
    ).toBe(404);

    const fenced = browser();
    await fenced.signIn("Umock-jl4-village-mycar-geofence");
    const [g] = (await fenced.call("GET", "/v1/resident/gates")).body;
    const vid = g.vehicles[0].id;
    expect(
      (await fenced.call("POST", `/v1/resident/gates/${g.gateId}/actions/open`, { vehicleId: vid }, idem())).status,
    ).toBe(422);
    const far = await fenced.call(
      "POST",
      `/v1/resident/gates/${g.gateId}/actions/open`,
      { vehicleId: vid, location: { lat: 13.75, lng: 100.5 } },
      idem(),
    );
    expect(far.body.code).toBe("gate.outside_geofence");
    expect(
      (
        await fenced.call(
          "POST",
          `/v1/resident/gates/${g.gateId}/actions/open`,
          { vehicleId: vid, location: ESTATE_POINT },
          idem(),
        )
      ).status,
    ).toBe(202);

    const off = browser();
    await off.signIn("Umock-jl4-village-mycar-gateoff");
    const [o] = (await off.call("GET", "/v1/resident/gates")).body;
    expect(o.enabled).toBe(false);
    const refused = await off.call(
      "POST",
      `/v1/resident/gates/${o.gateId}/actions/open`,
      { vehicleId: o.vehicles[0].id },
      idem(),
    );
    expect(refused.body.code).toBe("gate.resident_open_disabled");
  });

  it("SOS: raised once (an open one is returned), cancellable in the window, acknowledged by the guard", async () => {
    const b = browser();
    await b.signIn("Umock-jl4-coowner");
    const unitId = CONDO_UNIT.unitId;
    const first = await b.call("POST", "/v1/resident/sos", { unitId, kind: "medical" }, idem());
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ state: "open", existing: false, unit: { unitNo: "C-1203" } });
    expect(first.body.cancellableUntil).toBeTruthy();
    const second = await b.call("POST", "/v1/resident/sos", { unitId, kind: "fire" }, idem());
    expect(second.body).toMatchObject({ id: first.body.id, existing: true });
    const ack = await b.call("POST", `/v1/resident/__mock/sos/${first.body.id}/acknowledge`);
    expect(ack.body.state).toBe("acknowledged");
    const cancel = await b.call("POST", `/v1/resident/sos/${first.body.id}/actions/cancel`, {}, idem());
    expect(cancel.body.code).toBe("incident.invalid_state");
    const listed = (await b.call("GET", `/v1/resident/sos?unitId=${unitId}`)).body;
    expect(listed[0]).toMatchObject({ id: first.body.id, acknowledgedAt: expect.any(String), cancellableUntil: null });

    const other = browser();
    await other.signIn("Umock-jl4-coowner-cancel");
    const raised = (await other.call("POST", "/v1/resident/sos", { unitId, kind: "other" }, idem())).body;
    const cancelled = await other.call(
      "POST",
      `/v1/resident/sos/${raised.id}/actions/cancel`,
      { reason: "กดผิด" },
      idem(),
    );
    expect(cancelled.body).toMatchObject({ state: "cancelled", cancellableUntil: null });
  });

  it("an apartment tenant has no gate", async () => {
    const b = browser();
    await b.signIn("Umock-jl4-plain");
    expect((await b.call("GET", "/v1/resident/gates")).body).toEqual([]);
    expect((await b.call("GET", "/v1/resident/visits")).body.data).toEqual([]);
  });
});
