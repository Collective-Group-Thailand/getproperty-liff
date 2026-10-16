import { afterEach, describe, expect, it } from "vitest";

import { getLiff, openExternal, setLiffForTesting } from "./client";
import { resolveLiffState } from "./deepLink";
import { runLiffEntry } from "./entry";
import { createFakeLiff, FAKE_LIFF_MARKER } from "./fake";
import type { LiffStepName, LiffStepState } from "./types";

describe("createFakeLiff", () => {
  it("behaves like the SDK inside LINE by default and records calls", async () => {
    const liff = createFakeLiff();
    expect(liff.marker).toBe(FAKE_LIFF_MARKER);
    await liff.init({ liffId: "x" });
    expect(liff.isLoggedIn()).toBe(true);
    expect(liff.isInClient()).toBe(true);
    expect(liff.getIDToken()).toBe("fake.id.token");
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

  it("inits, finds the session and resolves the deep link", async () => {
    const { steps, onStep } = record();
    const result = await runLiffEntry(createFakeLiff(), {
      liffId: "1-abc",
      search: "?liff.state=%2Fbills%2F42",
      onStep,
    });
    expect(result).toEqual({ status: "ready", target: "/bills/42", inClient: true });
    expect(steps).toEqual([
      ["init", "running"],
      ["init", "done"],
      ["login", "running"],
      ["login", "done"],
      ["link", "running"],
      ["link", "done"],
    ]);
  });

  it("logs in outside LINE with the redirect URI", async () => {
    const liff = createFakeLiff({ loggedIn: false, inClient: false });
    const result = await runLiffEntry(liff, { liffId: "1-abc", search: "", redirectUri: "https://x/liff" });
    expect(liff.calls).toContain("login");
    expect(result).toMatchObject({ status: "ready", target: "/", inClient: false });
  });

  it("reports a missing LIFF id and a failing init as errors at the init step", async () => {
    expect(await runLiffEntry(createFakeLiff(), { liffId: undefined, search: "" })).toMatchObject({
      status: "error",
      step: "init",
    });
    expect(await runLiffEntry(createFakeLiff({ failInit: "boom" }), { liffId: "1", search: "" })).toEqual({
      status: "error",
      step: "init",
      message: "boom",
    });
  });

  it("fails the login step when LINE returns no id token", async () => {
    const result = await runLiffEntry(createFakeLiff({ idToken: null }), { liffId: "1", search: "" });
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
});
