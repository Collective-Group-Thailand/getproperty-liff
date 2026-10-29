import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/i18n/messages";
import type { Schemas } from "@/lib/api/types";

/**
 * Review G — the door-code panel: L2 (the code is hidden synchronously, in the event, when the page is hidden or
 * left — so no app-switcher or back-forward-cache snapshot shows it — and then removed) and L3 (`viewing.access_invalid_state` drops the code and
 * renders the page again). The real `browserApi` runs against a stubbed `fetch`.
 */
const net = vi.hoisted(() => ({ fetch: vi.fn<(request: Request) => Promise<Response>>() }));
vi.hoisted(() => {
  const Native = globalThis.Request;
  globalThis.Request = class extends Native {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === "string" && input.startsWith("/") ? new URL(input, "http://app.test") : input, init);
    }
  } as typeof Request;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    net.fetch(
      input instanceof Request ? input : new Request(new URL(String(input), "http://app.test"), init),
    )) as typeof fetch;
});
const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));

import { SelfViewingAccess } from "./SelfViewingAccess";

let messages: Record<string, unknown>;
beforeAll(async () => {
  messages = await loadMessages("en");
});
afterEach(() => {
  net.fetch.mockReset();
  vi.clearAllMocks();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": status < 300 ? "application/json" : "application/problem+json" },
  });

const VIEWING_ID = "3b241101-e2bb-4255-8caf-4136c566a962";
const iso = (offsetMinutes: number) => new Date(Date.now() + offsetMinutes * 60_000).toISOString();

function viewing(): Schemas["LeadViewingDto"] & { access: NonNullable<Schemas["LeadViewingDto"]["access"]> } {
  return {
    id: VIEWING_ID,
    access: {
      state: "issued",
      validFrom: iso(-10),
      validTo: iso(50),
      closedAt: null,
      closeReason: null,
      enteredAt: null,
      enteredSource: null,
      exitedAt: null,
      incidentAt: null,
      incidentNote: null,
    },
  } as unknown as Schemas["LeadViewingDto"] & { access: NonNullable<Schemas["LeadViewingDto"]["access"]> };
}

const CODE: Schemas["ViewingAccessCodeDto"] = {
  viewingId: VIEWING_ID,
  doorCode: "482913",
  locks: [],
  validFrom: iso(-10),
  validTo: iso(50),
};

async function showCode() {
  net.fetch.mockImplementationOnce(async () => json(CODE));
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Bangkok">
      <SelfViewingAccess viewing={viewing()} intent="code" />
    </NextIntlClientProvider>,
  );
  expect(await screen.findByTestId("self-door-code")).toHaveTextContent("482913");
}

describe("L2 — the door code leaves the screen at once", () => {
  it("on visibilitychange: hidden, synchronously", async () => {
    await showCode();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const code = screen.getByTestId("self-door-code");
    document.dispatchEvent(new Event("visibilitychange"));
    // No await: what a snapshot taken right now would show.
    expect(code).not.toBeVisible();
    await waitFor(() => expect(screen.queryByTestId("self-door-code")).toBeNull());
    visibility.mockRestore();
  });

  it("on pagehide, synchronously", async () => {
    await showCode();
    const code = screen.getByTestId("self-door-code");
    window.dispatchEvent(new Event("pagehide"));
    expect(code).not.toBeVisible();
    await waitFor(() => expect(screen.queryByTestId("self-door-code")).toBeNull());
  });
});

describe("L3 — viewing.access_invalid_state", () => {
  it("drops the code and renders the page again", async () => {
    await showCode();
    net.fetch.mockImplementationOnce(async () =>
      json({ type: "about:blank", title: "Invalid state", status: 409, code: "viewing.access_invalid_state" }, 409),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("self-arrive"));
    });
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("self-door-code")).toBeNull();
  });
});
