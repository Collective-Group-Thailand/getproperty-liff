import { afterEach, describe, expect, it, vi } from "vitest";

import { getLiff, inLineClient, openExternal, setLiffForTesting, shareToLine } from "./client";
import { resolveLiffState, safeInternalPath } from "./deepLink";
import { audienceFor, runLiffEntry } from "./entry";
import { createFakeLiff, DEFAULT_FAKE_SUB, FAKE_LIFF_MARKER, fakeOptionsFromCookie } from "./fake";
import { fakeLineIdToken, readFakeLineIdToken } from "./fakeLineToken";
import type { LiffExchange, LiffStepName, LiffStepState } from "./types";

const ok: LiffExchange = async () => ({ ok: true });

describe("createFakeLiff", () => {
  it("behaves like the SDK inside LINE by default and records calls", async () => {
    const liff = createFakeLiff();
    expect(liff.marker).toBe(FAKE_LIFF_MARKER);
    await liff.init({ liffId: "x" });
    expect(liff.isLoggedIn()).toBe(true);
    expect(liff.isInClient()).toBe(true);
    expect(readFakeLineIdToken(liff.getIDToken()!)?.sub).toBe(DEFAULT_FAKE_SUB);
    expect(liff.calls).toEqual(["init", "isLoggedIn", "isInClient", "getIDToken"]);
  });

  it("refuses calls before init, like the SDK", () => {
    expect(() => createFakeLiff().isLoggedIn()).toThrow(/before liff.init/);
  });

  it("logs in and out, and has no id token when logged out", async () => {
    const liff = createFakeLiff({ loggedIn: false });
    await liff.init({ liffId: "x" });
    expect(liff.getIDToken()).toBeNull();
    liff.login();
    expect(liff.isLoggedIn()).toBe(true);
    liff.logout();
    expect(liff.isLoggedIn()).toBe(false);
  });
});

describe("runLiffEntry", () => {
  const record = () => {
    const steps: [LiffStepName, LiffStepState][] = [];
    return { steps, onStep: (s: LiffStepName, st: LiffStepState) => steps.push([s, st]) };
  };

  it("inits, exchanges the id token through the BFF and resolves the deep link", async () => {
    const { steps, onStep } = record();
    const exchange = vi.fn<LiffExchange>(async () => ({ ok: true }));
    const liff = createFakeLiff({ sub: "U1" });
    const result = await runLiffEntry(liff, {
      liffId: "1-abc",
      search: "?liff.state=%2Fbills%2F42",
      exchange,
      onStep,
    });
    expect(result).toEqual({ status: "ready", target: "/bills/42", inClient: true, audience: "resident" });
    expect(exchange).toHaveBeenCalledWith(liff.getIDToken(), "resident");
    expect(steps).toEqual([
      ["init", "running"],
      ["init", "done"],
      ["login", "running"],
      ["login", "done"],
      ["session", "running"],
      ["session", "done"],
      ["link", "running"],
      ["link", "done"],
    ]);
  });

  it("never puts the id token in its result or its step reports (CLAUDE.md: no tokens in JS state)", async () => {
    const idToken = fakeLineIdToken({ sub: "Usecret" });
    const reported: unknown[] = [];
    const log = vi.spyOn(console, "log");
    const outcomes = await Promise.all([
      runLiffEntry(createFakeLiff({ idToken }), {
        liffId: "1",
        search: "?liff.state=%2Flink%3Fcode%3DOK-1",
        exchange: ok,
        onStep: (...args) => reported.push(args),
      }),
      runLiffEntry(createFakeLiff({ idToken }), {
        liffId: "1",
        search: "",
        exchange: async () => ({ ok: false, code: "auth.line_token_invalid", message: "invalid" }),
        onStep: (...args) => reported.push(args),
      }),
    ]);
    const serialised = JSON.stringify([outcomes, reported]);
    expect(serialised).not.toContain(idToken);
    expect(serialised).not.toContain(idToken.split(".")[1]);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("signs a technician deep link in as a technician only when the flag is on (R2)", async () => {
    const exchange = vi.fn<LiffExchange>(async () => ({ ok: true }));
    const on = await runLiffEntry(createFakeLiff(), {
      liffId: "1",
      search: "?liff.state=%2Ftechnician",
      exchange,
      technicianEnabled: true,
    });
    expect(on).toMatchObject({ status: "ready", audience: "technician" });
    expect(exchange).toHaveBeenLastCalledWith(expect.any(String), "technician");
    expect(audienceFor("/technician", false)).toBe("resident");
    expect(audienceFor("/technicians", true)).toBe("resident");
  });

  it("reports a refused exchange at the session step with the API's code", async () => {
    const result = await runLiffEntry(createFakeLiff(), {
      liffId: "1",
      search: "",
      exchange: async () => ({ ok: false, code: "auth.account_disabled", message: "disabled", requestId: "r-1" }),
    });
    expect(result).toEqual({
      status: "error",
      step: "session",
      message: "disabled",
      code: "auth.account_disabled",
      requestId: "r-1",
    });
  });

  it("logs in outside LINE with the redirect URI", async () => {
    const liff = createFakeLiff({ loggedIn: false, inClient: false });
    const result = await runLiffEntry(liff, {
      liffId: "1-abc",
      search: "",
      redirectUri: "https://x/liff",
      exchange: ok,
    });
    expect(liff.calls).toContain("login");
    expect(result).toMatchObject({ status: "ready", target: "/", inClient: false });
  });

  it("hands over to LINE Login outside LINE and reports the redirect (browser fake)", async () => {
    const redirect = vi.fn();
    const liff = createFakeLiff({ loggedIn: false, inClient: false, redirect });
    const exchange = vi.fn<LiffExchange>(async () => ({ ok: true }));
    const result = await runLiffEntry(liff, { liffId: "1", search: "", redirectUri: "https://x/liff?a=1", exchange });
    expect(result).toEqual({ status: "redirecting" });
    expect(redirect).toHaveBeenCalledWith("https://x/liff?a=1");
    expect(exchange).not.toHaveBeenCalled();
  });

  it("reports a missing LIFF id and a failing init as errors at the init step", async () => {
    expect(await runLiffEntry(createFakeLiff(), { liffId: undefined, search: "", exchange: ok })).toMatchObject({
      status: "error",
      step: "init",
    });
    expect(await runLiffEntry(createFakeLiff({ failInit: "boom" }), { liffId: "1", search: "", exchange: ok })).toEqual(
      {
        status: "error",
        step: "init",
        message: "boom",
      },
    );
  });

  it("fails the login step when LINE returns no id token", async () => {
    const result = await runLiffEntry(createFakeLiff({ idToken: null }), { liffId: "1", search: "", exchange: ok });
    expect(result).toMatchObject({ status: "error", step: "login" });
  });
});

describe("resolveLiffState", () => {
  it.each([
    ["", "/"],
    ["?liff.state=%2F", "/"],
    ["?liff.state=%2Fbills", "/bills"],
    ["?liff.state=bills%2F42", "/bills/42"],
    ["?liff.state=%2Frequests%3Fnew%3D1", "/requests?new=1"],
    ["?liff.state=%252Fusage", "/usage"],
    ["?liff.state=%2Ftechnician", "/technician"],
    ["?liff.state=%2Flink%3Fcode%3DOK-7KQ2M9", "/link?code=OK-7KQ2M9"],
  ])("%s → %s", (search, expected) => {
    expect(resolveLiffState(search)).toBe(expected);
  });

  it.each([
    "?liff.state=%2F%2Fevil.example%2Fx",
    "?liff.state=https%3A%2F%2Fevil.example",
    "?liff.state=javascript%3Aalert(1)",
    "?liff.state=%2F%5Cevil.example",
    "?liff.state=%2Fbff%2Fv1%2Fresident%2Fme",
    "?liff.state=%2Fbills%2F..%2F..%2Fbff",
    "?liff.state=%2Fliff",
    "?liff.state=%2Fadmin",
    "?liff.state=%2Fbills%0Aevil",
  ])("refuses %s", (search) => {
    expect(resolveLiffState(search)).toBe("/");
  });
});

describe("safeInternalPath", () => {
  it("keeps known in-app paths and refuses everything else", () => {
    expect(safeInternalPath("/consent?next=%2Fbills")).toBe("/consent?next=/bills");
    expect(safeInternalPath("https://evil.example/")).toBe("/");
    expect(safeInternalPath("/auth")).toBe("/");
    expect(safeInternalPath(null)).toBe("/");
  });
});

describe("fake LINE id token", () => {
  it("round-trips the claims in the format getproperty-api's fake verifier reads", () => {
    const token = fakeLineIdToken({ sub: "U42", name: "ทดสอบ" }, 1_000_000);
    expect(token.startsWith("fake-line.")).toBe(true);
    expect(readFakeLineIdToken(token, 1_000_000)).toMatchObject({ sub: "U42", name: "ทดสอบ", aud: "fake-channel" });
    expect(readFakeLineIdToken(token, 1_000_000 + 601_000)).toBeNull();
    expect(readFakeLineIdToken("forged.token.value")).toBeNull();
  });

  it("reads the browser fake's options from its cookie", () => {
    const value = encodeURIComponent(JSON.stringify({ inClient: false, sub: "Unewcomer" }));
    expect(fakeOptionsFromCookie(`a=1; gp_fake_liff=${value}`)).toEqual({ inClient: false, sub: "Unewcomer" });
    expect(fakeOptionsFromCookie("gp_fake_liff=%7Bbroken")).toEqual({});
  });
});

describe("client", () => {
  afterEach(() => setLiffForTesting(null));

  it("opens links with liff.openWindow, external by default", async () => {
    const fake = createFakeLiff();
    await fake.init({ liffId: "x" });
    setLiffForTesting(fake);
    expect(await getLiff()).toBe(fake);
    await openExternal("https://bank.example/pay");
    await openExternal("https://getproperty.co/help", { external: false });
    expect(fake.opened).toEqual([
      { url: "https://bank.example/pay", external: true },
      { url: "https://getproperty.co/help", external: false },
    ]);
  });

  it("initialises the SDK first on pages other than the LIFF entry (a reloaded /lease)", async () => {
    const fake = createFakeLiff();
    setLiffForTesting(fake);
    vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "1234567890-abcdefgh");
    await openExternal("https://storage.example.com/lease.pdf");
    vi.unstubAllEnvs();
    expect(fake.initialised).toBe(true);
    expect(fake.opened).toEqual([{ url: "https://storage.example.com/lease.pdf", external: true }]);
  });

  it("shares to a LINE chat through shareTargetPicker when LINE offers it (L2 receipts)", async () => {
    const message = [{ type: "text" as const, text: "ใบเสร็จ RCP-2026-00001" }];
    const inside = createFakeLiff();
    setLiffForTesting(inside);
    vi.stubEnv("NEXT_PUBLIC_LIFF_ID", "1234567890-abcdefgh");
    expect(await shareToLine(message)).toBe("sent");
    expect(inside.shared).toEqual([message]);
    expect(await inLineClient()).toBe(true);

    setLiffForTesting(createFakeLiff({ share: "cancel" }));
    expect(await shareToLine(message)).toBe("cancelled");
    setLiffForTesting(createFakeLiff({ share: "unavailable" }));
    expect(await shareToLine(message)).toBe("unavailable");
    const outside = createFakeLiff({ inClient: false });
    setLiffForTesting(outside);
    expect(await shareToLine(message)).toBe("unavailable");
    expect(outside.shared).toEqual([]);
    expect(await inLineClient()).toBe(false);
    setLiffForTesting(createFakeLiff({ failInit: "boom" }));
    expect(await shareToLine(message)).toBe("unavailable");
    vi.unstubAllEnvs();
  });
});
