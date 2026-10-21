import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ resolvers: [] as ((value: unknown) => void)[] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), usePathname: () => "/" }));
vi.mock("@/lib/api/browser", () => ({
  browserApi: { POST: () => new Promise((resolve) => api.resolvers.push(resolve)) },
}));

import { SIGNED_OUT_EVENT } from "@/lib/auth/signOut";

import { RealtimeBridge, SIGNED_OUT } from "./RealtimeBridge";

class FakeEventSource {
  static all: FakeEventSource[] = [];
  closed = false;
  onmessage: unknown = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeEventSource.all.push(this);
  }
  addEventListener() {}
  close() {
    this.closed = true;
  }
}

let visibility: DocumentVisibilityState = "visible";
const setVisibility = (value: DocumentVisibilityState) => {
  visibility = value;
  document.dispatchEvent(new Event("visibilitychange"));
};
const grant = { data: { streamUrl: "/v1/resident/realtime/stream", streamToken: "" } };
const open = () => FakeEventSource.all.filter((s) => !s.closed);

describe("RealtimeBridge (review M5)", () => {
  it("listens to the event signOut() fires", () => {
    expect(SIGNED_OUT).toBe(SIGNED_OUT_EVENT);
  });

  beforeEach(() => {
    FakeEventSource.all = [];
    api.resolvers = [];
    vi.stubGlobal("EventSource", FakeEventSource);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    visibility = "visible";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("hidden and shown while /realtime/auth is in flight: one stream, opened without the token in its URL", async () => {
    render(<RealtimeBridge />);
    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));
    await act(async () => {
      for (const resolve of api.resolvers) resolve(grant);
    });
    expect(open()).toHaveLength(1);
    expect(open()[0]!.url).toBe("/bff/v1/resident/realtime/stream");
  });

  it("closes the stream on sign-out and opens nothing for an authorisation that answers afterwards", async () => {
    render(<RealtimeBridge />);
    await act(async () => api.resolvers[0]!(grant));
    expect(open()).toHaveLength(1);
    act(() => setVisibility("hidden"));
    act(() => setVisibility("visible"));
    act(() => window.dispatchEvent(new Event(SIGNED_OUT_EVENT)));
    await act(async () => api.resolvers[1]?.(grant));
    expect(open()).toHaveLength(0);
  });
});
