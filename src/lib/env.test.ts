import { afterEach, describe, expect, it, vi } from "vitest";

import { InvalidEnvironmentError, parseServerEnv } from "./env";

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

describe("public values, read at run time (D-230)", () => {
  it("validates them with the server environment", () => {
    const env = parseServerEnv({
      NEXT_PUBLIC_LIFF_ID: "1234567890-AbCdEfGh",
      NEXT_PUBLIC_ASSET_BASE_URL: "https://collective-uat-getproperty-assets.s3.ap-southeast-7.amazonaws.com",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: " BPk ",
      NEXT_PUBLIC_ENV_BADGE: "uat",
    });
    expect(env).toMatchObject({
      NEXT_PUBLIC_LIFF_ID: "1234567890-AbCdEfGh",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BPk",
      NEXT_PUBLIC_ENV_BADGE: "uat",
    });
    expect(() => parseServerEnv({ NEXT_PUBLIC_LIFF_ID: "not a liff id" })).toThrow(/NEXT_PUBLIC_LIFF_ID/);
    expect(() => parseServerEnv({ NEXT_PUBLIC_ASSET_BASE_URL: "nope" })).toThrow(/NEXT_PUBLIC_ASSET_BASE_URL/);
    expect(() => parseServerEnv({ NEXT_PUBLIC_LINE_OA_ID: "getproperty" })).toThrow(/NEXT_PUBLIC_LINE_OA_ID/);
    expect(parseServerEnv({ NEXT_PUBLIC_LIFF_ID: "", NEXT_PUBLIC_VAPID_PUBLIC_KEY: "" })).toMatchObject({
      NEXT_PUBLIC_LIFF_ID: undefined,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined,
    });
  });

  it("hides the badge in production and keeps it elsewhere", () => {
    expect(parseServerEnv({ NEXT_PUBLIC_ENV_BADGE: "production" }).NEXT_PUBLIC_ENV_BADGE).toBeUndefined();
    expect(parseServerEnv({ NEXT_PUBLIC_ENV_BADGE: "" }).NEXT_PUBLIC_ENV_BADGE).toBeUndefined();
  });

  it("refuses a production container without its LIFF id unless it is a mock build", () => {
    vi.stubEnv("NEXT_PUBLIC_LIFF_MOCK", "0");
    const base = { NODE_ENV: "production", API_INTERNAL_URL: "http://getproperty-api:3000" };
    expect(() => parseServerEnv(base)).toThrow(/NEXT_PUBLIC_LIFF_ID: required in production/);
    expect(parseServerEnv({ ...base, NEXT_PUBLIC_LIFF_ID: "2000000001-prodChannel" }).NEXT_PUBLIC_LIFF_ID).toBe(
      "2000000001-prodChannel",
    );
    vi.stubEnv("NEXT_PUBLIC_LIFF_MOCK", "1");
    expect(parseServerEnv(base).NEXT_PUBLIC_LIFF_ID).toBeUndefined();
  });
});
