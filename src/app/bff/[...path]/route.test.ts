import { describe, expect, it } from "vitest";

import { DELETE, GET, PATCH, POST, PUT } from "./route";

describe("BFF placeholder (L0)", () => {
  it.each([GET, POST, PUT, PATCH, DELETE])("answers 501 problem+json, never cached", async (handler) => {
    const response = handler();
    expect(response.status).toBe(501);
    expect(response.headers.get("content-type")).toBe("application/problem+json");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ status: 501, code: "bff.not_implemented" });
  });
});
