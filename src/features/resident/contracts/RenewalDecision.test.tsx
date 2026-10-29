import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/i18n/messages";

/**
 * Review G, L3: an offer withdrawn, expired or answered meanwhile (`renewal.invalid_state`) renders the page again
 * (it then shows the offer as it is), and the answer form closes. The real `browserApi` runs against a stubbed `fetch`.
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

import { RenewalDecision } from "./RenewalDecision";

let messages: Record<string, unknown>;
beforeAll(async () => {
  messages = await loadMessages("en");
});
afterEach(() => {
  net.fetch.mockReset();
  vi.clearAllMocks();
});

const invalidState = () =>
  new Response(
    JSON.stringify({ type: "about:blank", title: "Invalid state", status: 409, code: "renewal.invalid_state" }),
    { status: 409, headers: { "content-type": "application/problem+json" } },
  );

function show() {
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Bangkok">
      <RenewalDecision
        offerId="3b241101-e2bb-4255-8caf-4136c566a962"
        actions={["accept", "decline"]}
        terms="15,500 baht a month for 12 months from 1 Jan 2027"
        consequence="Your lease ends on 31 Dec 2026."
      />
    </NextIntlClientProvider>,
  );
}

describe("L3 — renewal.invalid_state", () => {
  it("declining an offer that is no longer open renders the page again and closes the form", async () => {
    net.fetch.mockImplementation(async () => invalidState());
    show();
    fireEvent.click(screen.getByTestId("renewal-decline"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("renewal-decline-confirm"));
    });
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("renewal-decline-form")).toBeNull();
  });

  it("accepting it renders the page again too", async () => {
    net.fetch.mockImplementation(async () => invalidState());
    show();
    fireEvent.click(screen.getByTestId("renewal-accept"));
    const confirm = await screen.findByRole("button", { name: "Accept" });
    await act(async () => {
      fireEvent.click(confirm);
    });
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
  });
});
