import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/i18n/messages";

/**
 * Regression tests of the independent LIFF review (`../REVIEW-liff.md`): M1 (network failures), M2 (one key and one
 * frozen body per logical action), M4 (the move-out notice is idempotent and recovers a recorded notice). The real
 * `browserApi` runs against a stubbed `fetch`, so the shared client's error handling is part of what is tested.
 */
const net = vi.hoisted(() => ({ fetch: vi.fn<(request: Request) => Promise<Response>>() }));
vi.hoisted(() => {
  // Node's `Request` (under jsdom) refuses the relative `/bff/…` URLs a browser resolves against the page.
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
const uploads = vi.hoisted(() => ({ count: 0 }));
vi.mock("@/features/shared/upload", () => ({
  uploadResidentPhoto: vi.fn(async () => `file-${++uploads.count}`),
  withRetry: <T,>(task: () => Promise<T>) => task(),
}));
vi.mock("@/ui/components/CameraCapture", () => ({
  CameraCapture: ({ onCapture }: { onCapture: (files: File[]) => void }) => (
    <button
      type="button"
      data-testid="capture"
      onClick={() => onCapture([new File(["x"], "a.jpg", { type: "image/jpeg" })])}
    >
      capture
    </button>
  ),
}));

import { ConsentForm } from "@/features/resident/consent/ConsentForm";
import { DepositResponse } from "@/features/resident/deposit/DepositResponse";
import { VisitorCode } from "@/features/resident/access/VisitorCode";
import { NoticeForm } from "@/features/resident/lease/NoticeForm";
import { LinkInvitation } from "@/features/resident/link/LinkInvitation";

let messages: Record<string, unknown>;
beforeAll(async () => {
  messages = await loadMessages("en");
});
beforeEach(() => {
  uploads.count = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => undefined }));
});
afterEach(() => {
  net.fetch.mockReset();
  vi.clearAllMocks();
});

const wrap = (ui: ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Bangkok">
      {ui}
    </NextIntlClientProvider>,
  );
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": status < 300 ? "application/json" : "application/problem+json" },
  });
const dropped = () => Promise.reject(new TypeError("Failed to fetch"));
const sent = (index: number) => net.fetch.mock.calls[index]![0];

describe("M1 — a dropped connection is shown and the screen recovers", () => {
  it("first-use consent: the button comes back and says there is no connection", async () => {
    net.fetch.mockImplementation(dropped);
    const purposes = [
      {
        key: "resident.service",
        title: "Service",
        bodyMarkdown: "We use your data.",
        version: 1,
        required: true,
        granted: null,
        grantedVersion: null,
        language: "en",
        capturedAt: null,
        effectiveFrom: "2026-01-01T00:00:00Z",
      },
    ];
    wrap(<ConsentForm purposes={purposes} language="en" next="/" />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByTestId("consent-submit"));
    expect(await screen.findByText("Can't connect")).toBeInTheDocument();
    expect(screen.getByTestId("consent-submit")).toBeEnabled();
    expect(nav.replace).not.toHaveBeenCalled();
  });
});

describe("M2 — one Idempotency-Key and one frozen body per logical action", () => {
  it("visitor code: the retry after a lost answer sends the first body under the first key", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-11-01T10:00:00Z"));
    net.fetch.mockImplementationOnce(dropped).mockImplementationOnce(async () =>
      json(
        {
          id: "c1",
          pin: "482913",
          holderName: "Somchai",
          validFrom: "2026-11-01T10:00:00Z",
          validTo: "2026-11-01T12:00:00Z",
          lockId: "l1",
          kind: "visitor",
          status: "active",
        },
        201,
      ),
    );
    wrap(<VisitorCode unitId="u1" policy={{ allowed: true, maxHours: 24 }} />);
    fireEvent.change(screen.getByTestId("visitor-name"), { target: { value: "Somchai" } });
    fireEvent.click(screen.getByTestId("visitor-submit"));
    expect(await screen.findByText("Can't connect")).toBeInTheDocument();
    now.mockReturnValue(Date.parse("2026-11-01T10:00:45Z")); // the resident taps again 45 s later
    fireEvent.click(screen.getByTestId("visitor-submit"));
    expect(await screen.findByTestId("visitor-pin")).toHaveTextContent("482913");
    const [first, second] = [sent(0), sent(1)];
    expect(second.headers.get("idempotency-key")).toBe(first.headers.get("idempotency-key"));
    expect(await second.clone().text()).toBe(await first.clone().text());
    now.mockRestore();
  });

  it("deposit dispute: photos are uploaded once and the retry repeats the same body and key", async () => {
    net.fetch.mockImplementationOnce(dropped).mockImplementationOnce(async () => json({ id: "d1" }));
    wrap(<DepositResponse depositId="d1" refund="1000.00" canAccept canDispute />);
    fireEvent.click(screen.getByRole("button", { name: /dispute/i }));
    fireEvent.change(screen.getByTestId("deposit-dispute-reason"), { target: { value: "The wall was like this" } });
    fireEvent.click(await screen.findByTestId("capture")); // the camera loads with the dispute form (GL4 budget)
    fireEvent.click(screen.getByTestId("deposit-dispute-submit"));
    expect(await screen.findByText("Can't connect")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("deposit-dispute-submit"));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(uploads.count).toBe(1);
    const [first, second] = [sent(0), sent(1)];
    expect(second.headers.get("idempotency-key")).toBe(first.headers.get("idempotency-key"));
    expect(JSON.parse(await second.clone().text())).toEqual({
      reason: "The wall was like this",
      photoDocumentIds: ["file-1"],
    });
    expect(await second.clone().text()).toBe(await first.clone().text());
  });
});

describe("M4 — the move-out notice", () => {
  const lease = { id: "l1", unitNo: "A-101", buildingName: "Tower A" };
  const recorded = {
    id: "l1",
    unitNo: "A-101",
    notice: { by: "lessee", effectiveDate: "2026-12-31", givenAt: "2026-11-01T10:00:00Z" },
  };

  async function confirmNotice() {
    wrap(<NoticeForm lease={lease} earliest="2026-12-31" locale="en" />);
    fireEvent.click(screen.getByTestId("notice-review"));
    await act(async () => {
      fireEvent.click(screen.getByTestId("notice-submit"));
    });
  }

  it("carries an Idempotency-Key, and the retry after a lost answer repeats it with the same body", async () => {
    net.fetch.mockImplementationOnce(dropped).mockImplementationOnce(async () => json(recorded));
    await confirmNotice();
    expect(await screen.findByText("Can't connect")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("notice-review"));
    fireEvent.click(screen.getByTestId("notice-submit"));
    expect(await screen.findByTestId("notice-done")).toBeInTheDocument();
    const [first, second] = [sent(0), sent(1)];
    expect(first.headers.get("idempotency-key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.headers.get("idempotency-key")).toBe(first.headers.get("idempotency-key"));
    expect(await second.clone().text()).toBe(await first.clone().text());
  });

  it("a 409 for a notice already on file shows the recorded notice, not an error", async () => {
    net.fetch
      .mockImplementationOnce(async () =>
        json({ status: 409, code: "lease.invalid_state", title: "x", detail: "x" }, 409),
      )
      .mockImplementationOnce(async () => json(recorded));
    await confirmNotice();
    expect(await screen.findByTestId("notice-done")).toBeInTheDocument();
    expect(sent(1).method).toBe("GET");
  });
});

describe("L3 — the link is on file even when the session rotation after it fails", () => {
  it("shows the linked unit although /bff/auth/refresh answered 502", async () => {
    net.fetch
      .mockImplementationOnce(async () =>
        json({
          refreshRequired: true,
          leaseId: "l1",
          units: [{ unitId: "u1", unitNo: "A-101", buildingName: "Tower A" }],
        }),
      )
      .mockImplementationOnce(async () => json({ status: 502, code: "bff.upstream_unavailable" }, 502));
    wrap(<LinkInvitation initialCode="ABCD-EFGH-JKLM-NPQR" />);
    fireEvent.submit(screen.getByRole("button", { name: /link|confirm/i }).closest("form")!);
    expect(await screen.findByTestId("link-success")).toBeInTheDocument();
    await waitFor(() => expect(net.fetch).toHaveBeenCalledTimes(2));
    expect(new URL(sent(1).url).pathname).toBe("/bff/auth/refresh");
    expect(screen.queryByText(/unavailable/i)).toBeNull();
  });
});
