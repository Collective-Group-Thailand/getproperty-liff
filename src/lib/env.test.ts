import { afterEach, describe, expect, it, vi } from "vitest";

import { InvalidEnvironmentError, parseClientEnv, parseServerEnv } from "./env";

afterEach(() => vi.unstubAllEnvs());

describe("server environment", () => {
  it("parses flags and defaults", () => {
    const env = parseServerEnv({ API_INTERNAL_URL: "http://api:4000", FEATURE_TECHNICIAN: "1" });
    expect(env).toMatchObject({ API_INTERNAL_URL: "http://api:4000", FEATURE_TECHNICIAN: true, API_MOCKS: false });
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(0.1);
  });

  it("requires the API's URL in production unless mocked", () => {
    expect(() => parseServerEnv({ NODE_ENV: "production" })).toThrow(/API_INTERNAL_URL: required/);
  });

  it("refuses API mocks outside a mock build", () => {
    vi.stubEnv("NEXT_PUBLIC_LIFF_MOCK", "0");
    expect(() => parseServerEnv({ API_MOCKS: "1" })).toThrow(/API_MOCKS=1 needs a mock build/);
    vi.stubEnv("NEXT_PUBLIC_LIFF_MOCK", "1");
    expect(parseServerEnv({ API_MOCKS: "1", NODE_ENV: "production" }).API_MOCKS).toBe(true);
  });

  it("names the variable, never the value", () => {
    try {
      parseServerEnv({ API_INTERNAL_URL: "secret-value-not-a-url", APP_ORIGIN: "https://x.example/path" });
      throw new Error("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvironmentError);
      const message = (error as Error).message;
      expect(message).toContain("API_INTERNAL_URL");
      expect(message).toContain("APP_ORIGIN");
      expect(message).not.toContain("secret-value");
    }
  });
});

describe("client environment", () => {
  it("validates the public values", () => {
    expect(parseClientEnv({ NEXT_PUBLIC_LINE_OA_ID: "@getproperty", NEXT_PUBLIC_LIFF_MOCK: "1" })).toMatchObject({
      NEXT_PUBLIC_LINE_OA_ID: "@getproperty",
      NEXT_PUBLIC_LIFF_MOCK: true,
    });
    expect(() => parseClientEnv({ NEXT_PUBLIC_LINE_OA_ID: "getproperty" })).toThrow(/NEXT_PUBLIC_LINE_OA_ID/);
    expect(() => parseClientEnv({ NEXT_PUBLIC_ASSET_BASE_URL: "nope" })).toThrow(/NEXT_PUBLIC_ASSET_BASE_URL/);
  });
});
