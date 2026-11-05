// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createBffHandler } from "../src/lib/bff/handler";
import { fakeLineIdToken } from "../src/lib/liff/fakeLineToken";
import { handleMockRequest } from "./server";
import { CONDO_UNIT, CONDO_UNIT_SECOND, VILLAGE_UNIT } from "./state";

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

const U = CONDO_UNIT.unitId;
const idem = () => ({ "idempotency-key": crypto.randomUUID() });

describe("JL1 mock: a co-owner's money with the juristic office", () => {
  it("names the place by kind with the register's measures (CR #42) and bills yearly with …annual…", async () => {
    const b = browser();
    await b.signIn("Umock-jl1-coowner-twounits-annual");
    const units = (await b.call("GET", "/v1/resident/me/units")).body.units;
    expect(units.map((u: Body) => [u.unitNo, u.propertyKind, u.areaSqm])).toEqual([
      ["C-1203", "condo", "42.50"],
      [CONDO_UNIT_SECOND.unitNo, "condo", "35.00"],
    ]);
    const open = (await b.call("GET", "/v1/resident/invoices?unpaid=true&perPage=100")).body.data;
    expect(open).toHaveLength(2);
    expect(open[0].periodEnd.slice(5)).toBe("12-31");
    expect(open[0].periodStart.slice(5)).toBe("01-01");
  });

  it("a house in a housing estate: village, land area in ตร.วา", async () => {
    const b = browser();
    await b.signIn("Umock-jl1-village");
    const [unit] = (await b.call("GET", "/v1/resident/me/units")).body.units;
    expect(unit).toMatchObject({ unitNo: VILLAGE_UNIT.unitNo, propertyKind: "village", landAreaSqwa: "62.50" });
  });

  it("statements and their PDF; budget vs actual; 404 without a budget", async () => {
    const b = browser();
    await b.signIn("Umock-jl1-coowner");
    const list = await b.call("GET", "/v1/resident/statements");
    expect(list.body.data).toHaveLength(2);
    expect(list.body.data[0].amountDue).toBe("2125.00");
    const pdf = await b.call("GET", `/v1/resident/statements/${list.body.data[0].id}/document`);
    expect(pdf.body.url).toMatch(/statements/);
    expect((await b.call("GET", `/v1/resident/units/${U}/budget-vs-actual`)).body.billedVsBudgetPct).toBe("77.00");
    const none = browser();
    await none.signIn("Umock-jl1-coowner-nobudget-stmpending");
    expect((await none.call("GET", `/v1/resident/units/${U}/budget-vs-actual`)).status).toBe(404);
    const pending = (await none.call("GET", "/v1/resident/statements")).body.data[0];
    expect((await none.call("GET", `/v1/resident/statements/${pending.id}/document`)).body.code).toBe(
      "statement.document_pending",
    );
  });

  it("payment plan: limits, one open plan, withdraw; replay by key", async () => {
    const b = browser();
    await b.signIn("Umock-jl1-coowner-plan");
    const path = `/v1/resident/units/${U}/payment-plan-requests`;
    const over = await b.call("POST", path, { instalments: 13 }, idem());
    expect(over.status).toBe(422);
    expect(over.body.errors[0].path).toBe("instalments");
    const key = idem();
    const created = await b.call("POST", path, { instalments: 3 }, key);
    expect(created.status).toBe(201);
    expect(created.body.state).toBe("proposed");
    expect(created.body.instalments.map((i: Body) => i.amount)).toEqual(["708.33", "708.33", "708.34"]);
    expect((await b.call("POST", path, { instalments: 3 }, key)).body.id).toBe(created.body.id);
    expect((await b.call("POST", path, { instalments: 4 }, idem())).body.code).toBe("payment_plan.open_exists");
    const withdrawn = await b.call("POST", `/v1/resident/units/${U}/payment-plans/${created.body.id}/actions/withdraw`);
    expect(withdrawn.body.state).toBe("cancelled");
    expect((await b.call("GET", `/v1/resident/units/${U}/payment-plans`)).body).toHaveLength(1);
  });

  it("debt clearance: refused with the outstanding amount, issued once paid (code returned once)", async () => {
    const b = browser();
    await b.signIn("Umock-jl1-coowner-clearance");
    const path = `/v1/resident/units/${U}/debt-clearance-requests`;
    const refused = await b.call("POST", path, {}, idem());
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: "debt_clearance.outstanding", outstanding: "2125.00" });
    const [open] = (await b.call("GET", "/v1/resident/invoices?unpaid=true")).body.data;
    expect((await b.call("POST", `/v1/resident/__mock/invoices/${open.id}/pay`)).status).toBe(200);
    const issued = await b.call("POST", path, { language: "en" }, idem());
    expect(issued.status).toBe(201);
    expect(issued.body).toMatchObject({ state: "issued", language: "en" });
    expect(issued.body.verifyCode).toBeTruthy();
    const [listed] = (await b.call("GET", `/v1/resident/units/${U}/debt-clearances`)).body;
    expect(listed.verifyCode).toBeNull();
    expect(listed.verifyCodeHint).toBe(issued.body.verifyCode.slice(-4));
  });

  it("recurring: unavailable answers 409; otherwise pending → setup → active → cancelled", async () => {
    const off = browser();
    await off.signIn("Umock-jl1-coowner-recurringoff");
    const path = `/v1/resident/units/${U}/payment-mandates`;
    expect((await off.call("POST", path, { method: "direct_debit" }, idem())).body.code).toBe("recurring.unavailable");
    const b = browser();
    await b.signIn("Umock-jl1-coowner-mandate");
    const created = await b.call("POST", path, { method: "card_token" }, idem());
    expect(created.body.mandate.state).toBe("pending");
    await b.call("GET", created.body.setupUrl.replace(/^\/bff/, "")).catch(() => undefined); // HTML page
    const [active] = (await b.call("GET", path)).body;
    expect(active.state).toBe("active");
    const cancelled = await b.call("POST", `${path}/${active.id}/actions/cancel`);
    expect(cancelled.body.state).toBe("revoked");
  });
});
