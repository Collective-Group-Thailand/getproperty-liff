// @vitest-environment node
import { describe, expect, it } from "vitest";

import { forwardedChainAllowed, ipAllowed, parseCidrList, PRIVATE_RANGES } from "./cidr";

const h = (init: Record<string, string>) => new Headers(init);

describe("parseCidrList / ipAllowed (D-230, same rules as getproperty-api)", () => {
  const list = parseCidrList("172.30.0.0/16, 127.0.0.1, ::1/128");

  it("matches subnets, single addresses, IPv6 and IPv4-mapped IPv6", () => {
    expect(ipAllowed(list, "172.30.4.7")).toBe(true);
    expect(ipAllowed(list, "::ffff:172.30.0.9")).toBe(true);
    expect(ipAllowed(list, "127.0.0.1")).toBe(true);
    expect(ipAllowed(list, "::1")).toBe(true);
    expect(ipAllowed(list, "172.31.0.1")).toBe(false);
    expect(ipAllowed(list, "203.0.113.9")).toBe(false);
    expect(ipAllowed(list, "not-an-ip")).toBe(false);
    expect(ipAllowed(list, undefined)).toBe(false);
  });

  it("refuses invalid entries", () => {
    expect(() => parseCidrList("10.0.0.0/33")).toThrow(/invalid prefix/);
    expect(() => parseCidrList("example.com")).toThrow(/invalid IP/);
    expect(() => parseCidrList("10.0.0.0/8/1")).toThrow(/invalid IP/);
    expect(() => parseCidrList("10.0.0.0/x")).toThrow(/invalid prefix/);
  });

  it("the default covers loopback and the private ranges, not the internet", () => {
    const fallback = parseCidrList(PRIVATE_RANGES);
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.30.0.5", "192.168.1.1", "::1", "fd00::1"]) {
      expect(ipAllowed(fallback, ip)).toBe(true);
    }
    expect(ipAllowed(fallback, "8.8.8.8")).toBe(false);
  });
});

describe("forwardedChainAllowed", () => {
  const list = parseCidrList(PRIVATE_RANGES);

  it("accepts Alloy on the docker network (Next writes the peer address when there is no header)", () => {
    expect(forwardedChainAllowed(list, h({ "x-forwarded-for": "::ffff:172.30.0.12" }))).toBe(true);
  });

  it("refuses a request through Caddy, a mixed chain or no address at all", () => {
    expect(forwardedChainAllowed(list, h({ "x-forwarded-for": "203.0.113.9" }))).toBe(false);
    expect(forwardedChainAllowed(list, h({ "x-forwarded-for": "10.0.0.1, 203.0.113.9" }))).toBe(false);
    expect(forwardedChainAllowed(list, h({ "x-forwarded-for": "203.0.113.9, 172.30.0.2" }))).toBe(false);
    expect(forwardedChainAllowed(list, h({}))).toBe(false);
  });
});
