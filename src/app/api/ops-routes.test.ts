// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resetEnvForTesting } from "@/lib/env";
import { resetMetricsForTesting } from "@/lib/observability/metrics";

import { GET as health, HEAD as healthHead } from "./healthz/route";
import { GET as metrics } from "./metrics/route";

const scrape = (forwardedFor?: string) =>
  metrics(
    new Request("http://getproperty-liff:3000/api/metrics", {
      headers: forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
    }),
  );

beforeEach(() => {
  resetEnvForTesting();
  resetMetricsForTesting();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetEnvForTesting();
  resetMetricsForTesting();
});

describe("/api/healthz (D-230 image contract)", () => {
  it("answers 200 ok, never cached, without calling the API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = health();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(healthHead().status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("/api/metrics (D-230 image contract)", () => {
  it("serves Prometheus text with the service label to the docker network", async () => {
    vi.stubEnv("OTEL_SERVICE_NAME", "getproperty-liff");
    const response = await scrape("::ffff:172.30.0.12");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toMatch(/^text\/plain; version=0\.0\.4/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.text();
    expect(body).toMatch(/^process_resident_memory_bytes\{service="getproperty-liff"\} \d+/m);
    expect(body).toContain("nodejs_eventloop_lag_seconds");
  });

  it("is a 404 for the internet (through Caddy), a mixed chain or an unknown peer", async () => {
    for (const chain of ["203.0.113.9", "172.30.0.12, 203.0.113.9", undefined]) {
      const response = await scrape(chain);
      expect(response.status).toBe(404);
      expect(await response.text()).toBe("");
    }
  });

  it("follows METRICS_ALLOWED_CIDRS when set", async () => {
    vi.stubEnv("METRICS_ALLOWED_CIDRS", "172.30.0.0/16");
    expect((await scrape("172.30.1.1")).status).toBe(200);
    resetEnvForTesting();
    expect((await scrape("10.0.0.1")).status).toBe(404);
  });

  it("registers the runtime metrics once per process", async () => {
    await scrape("127.0.0.1");
    const second = await (await scrape("127.0.0.1")).text();
    expect(second.match(/^# TYPE process_cpu_user_seconds_total counter$/gm)).toHaveLength(1);
  });
});
