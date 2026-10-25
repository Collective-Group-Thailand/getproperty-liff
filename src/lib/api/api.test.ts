import { describe, expect, it } from "vitest";

import { needsIdempotencyKey } from "./idempotency";
import { OPERATIONS } from "./operations.generated";
import { ApiError, problemFromResponse } from "./problem";
import { createQueryClient, qk } from "./query";

describe("Idempotency-Key", () => {
  it("is required exactly where the contract flags it", () => {
    expect(needsIdempotencyKey("POST", "/v1/resident/data-subject-requests")).toBe(true);
    expect(needsIdempotencyKey("post", "/v1/resident/data-subject-requests?x=1")).toBe(true);
    expect(needsIdempotencyKey("GET", "/v1/resident/data-subject-requests")).toBe(false);
    expect(needsIdempotencyKey("POST", "/v1/resident/consents")).toBe(false);
  });

  it("covers only the resident, technician and prospect operations (with their auth), the public listing reads and the landlord's quick actions", () => {
    for (const op of OPERATIONS) {
      expect(op.path).toMatch(
        /^\/v1\/(resident|technician|prospect|auth\/resident|auth\/technician|auth\/prospect|public\/listings)(\/|$)|^\/v1\/auth\/(refresh|logout|operator\/identity)$|^\/v1\/owner\/(me|leads|listing-viewings|payments|invoices|leases)(\/|$)/,
      );
    }
  });
});

describe("ApiError", () => {
  it("reads a problem with its legal reference, field errors and request id", async () => {
    const response = new Response(
      JSON.stringify({
        type: "https://errors.getproperty.co/compliance.tariff_cap",
        title: "Bill line above the utility tariff cap",
        status: 422,
        code: "compliance.tariff_cap",
        detail: "ค่าไฟฟ้าต่อหน่วยสูงกว่าอัตราของการไฟฟ้า",
        legalRef: "ประกาศคณะกรรมการว่าด้วยสัญญา พ.ศ. 2568 ข้อ 4",
        errors: [{ path: "phone", code: "matches", message: "bad phone" }],
        requestId: "req-1",
      }),
      { status: 422, headers: { "content-type": "application/problem+json" } },
    );
    const error = await problemFromResponse(response);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.isCompliance).toBe(true);
    expect(error.legalRef).toContain("ข้อ 4");
    expect(error.fieldError("phone")).toBe("bad phone");
    expect(error.requestId).toBe("req-1");
  });

  it("survives a non-JSON error page and keeps the header request id", async () => {
    const error = await problemFromResponse(
      new Response("<html>bad gateway</html>", { status: 502, headers: { "x-request-id": "edge-9" } }),
    );
    expect(error.code).toBe("http.502");
    expect(error.requestId).toBe("edge-9");
  });
});

describe("TanStack Query defaults", () => {
  it("never retries a 4xx, retries other failures twice, never retries mutations", () => {
    const client = createQueryClient();
    const retry = client.getDefaultOptions().queries!.retry as (count: number, error: unknown) => boolean;
    expect(retry(0, new ApiError(404, { code: "http.not_found" }))).toBe(false);
    expect(retry(0, new ApiError(503, { code: "service.unavailable" }))).toBe(true);
    expect(retry(2, new TypeError("network"))).toBe(false);
    expect(client.getDefaultOptions().mutations!.retry).toBe(false);
    expect(qk.resident.consents("th")).toEqual(["resident", "consents", "th"]);
  });
});
