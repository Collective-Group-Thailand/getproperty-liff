import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signalRealtime } from "@/lib/realtime/events";

const nav = vi.hoisted(() => ({ refresh: vi.fn(), bff: vi.fn(), assign: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: nav.refresh }) }));
vi.mock("@/lib/api/browser", () => ({ bffJson: nav.bff }));

import { LINK_CHANGED_EVENT, LINK_CHECK_ATTRIBUTE, linkDecision } from "./linkDecision";
import { LinkPendingWatch } from "./LinkPendingWatch";

const UNIT = "7d1c3a52-1111-4e7a-9f0c-1d2e3f4a5b6c";
const LEASE = "9a8b7c6d-2222-4e7a-9f0c-1d2e3f4a5b6c";
const me = (over: Partial<Parameters<typeof linkDecision>[1]> = {}) => ({
  linkRequestsPending: 1,
  units: [] as { unitId: string }[],
  leaseIds: [] as string[],
  scopes: [] as string[],
  ...over,
});

describe("link decision from a fresh /me (D-226, D-228)", () => {
  it("is confirmed when /me lists a new unit, or one the token does not cover yet", () => {
    expect(linkDecision({ pending: 1, unitIds: [] }, me({ linkRequestsPending: 0, units: [{ unitId: UNIT }] }))).toBe(
      "confirmed",
    );
    // Same units as the page, but the lease is not in the token yet (a move-in since the last refresh).
    expect(
      linkDecision(
        { pending: 1, unitIds: [UNIT] },
        me({ units: [{ unitId: UNIT }], leaseIds: [LEASE], scopes: [`unit:${UNIT}`] }),
      ),
    ).toBe("confirmed");
  });

  it("is declined when nothing waits any more and there is still no unit", () => {
    expect(linkDecision({ pending: 2, unitIds: [] }, me({ linkRequestsPending: 0 }))).toBe("declined");
  });

  it("only changed when one of several was decided, or a linked resident lost a pending record", () => {
    expect(linkDecision({ pending: 2, unitIds: [] }, me({ linkRequestsPending: 1 }))).toBe("changed");
    expect(
      linkDecision(
        { pending: 1, unitIds: [UNIT] },
        me({ linkRequestsPending: 0, units: [{ unitId: UNIT }], scopes: [`unit:${UNIT}`] }),
      ),
    ).toBe("changed");
  });

  it("is still waiting when nothing was decided (or another match arrived)", () => {
    expect(linkDecision({ pending: 1, unitIds: [] }, me())).toBe("waiting");
    expect(linkDecision({ pending: 1, unitIds: [] }, me({ linkRequestsPending: 2 }))).toBe("waiting");
  });
});

function renderCard() {
  return render(
    <LinkPendingWatch
      pending={1}
      unitIds={[]}
      declined={<p data-testid="declined">declined</p>}
      stillWaiting="still waiting"
    >
      <p data-testid="waiting">waiting</p>
      <a href="https://liff.example/" data-testid="check" {...{ [LINK_CHECK_ATTRIBUTE]: "" }}>
        check again
      </a>
    </LinkPendingWatch>,
  );
}

describe("LinkPendingWatch — the pending card follows the office's decision (LIFF #31)", () => {
  beforeEach(() => {
    vi.stubGlobal("location", { ...window.location, pathname: "/", search: "", assign: nav.assign });
    // Nothing decided yet, unless a test says otherwise (`mockResolvedValueOnce` after the arrival check).
    nav.bff.mockResolvedValue(me());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetAllMocks();
  });

  /** Renders, then waits for the quiet check made on arrival (the module loads on demand). */
  async function arrived(ui: () => ReturnType<typeof render>) {
    const view = ui();
    await waitFor(() => expect(nav.bff).toHaveBeenCalledTimes(1));
    return view;
  }

  it("reads /me once on arrival and stays quiet while nothing was decided", async () => {
    await arrived(renderCard);
    expect(nav.bff).toHaveBeenCalledWith("/v1/resident/me");
    expect(screen.getByTestId("waiting")).toBeInTheDocument();
    expect(screen.getByTestId("link-pending-status")).toHaveTextContent("");
  });

  it("finds a decision made before it arrived", async () => {
    nav.bff.mockResolvedValueOnce(me({ linkRequestsPending: 0 }));
    renderCard();
    expect(await screen.findByTestId("declined")).toBeInTheDocument();
  });

  it("runs an event heard during a check right after it, never drops it", async () => {
    let release: (value: unknown) => void = () => undefined;
    nav.bff.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    nav.bff.mockResolvedValueOnce(me({ linkRequestsPending: 0 }));
    renderCard();
    await waitFor(() => expect(nav.bff).toHaveBeenCalledTimes(1));
    act(() => signalRealtime(LINK_CHANGED_EVENT));
    await act(async () => release(me()));
    expect(await screen.findByTestId("declined")).toBeInTheDocument();
    expect(nav.bff).toHaveBeenCalledTimes(2);
  });

  it("swaps to the declined state on party.link_changed when nothing waits any more", async () => {
    await arrived(renderCard);
    nav.bff.mockResolvedValueOnce(me({ linkRequestsPending: 0 }));
    act(() => signalRealtime(LINK_CHANGED_EVENT));
    expect(await screen.findByTestId("declined")).toBeInTheDocument();
    expect(screen.queryByTestId("waiting")).toBeNull();
    expect(nav.bff).toHaveBeenLastCalledWith("/v1/resident/me");
  });

  it("rotates the session through /auth/rescope when the office confirmed", async () => {
    await arrived(renderCard);
    nav.bff.mockResolvedValueOnce(me({ linkRequestsPending: 0, units: [{ unitId: UNIT }] }));
    act(() => signalRealtime(LINK_CHANGED_EVENT));
    await waitFor(() => expect(nav.assign).toHaveBeenCalledWith("/auth/rescope?next=%2F"));
  });

  it("ignores other realtime events", async () => {
    await arrived(renderCard);
    act(() => signalRealtime("invoice.paid"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(nav.bff).toHaveBeenCalledTimes(1);
  });

  it("'check again' reads /me in place and says when nothing was decided yet", async () => {
    await arrived(renderCard);
    fireEvent.click(screen.getByTestId("check"));
    expect(await screen.findByText("still waiting")).toBeInTheDocument();
    expect(nav.assign).not.toHaveBeenCalled();
    expect(screen.getByTestId("waiting")).toBeInTheDocument();
  });

  it("'check again' falls back to the plain reload when /me cannot be read", async () => {
    await arrived(renderCard);
    nav.bff.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getByTestId("check"));
    await waitFor(() => expect(nav.assign).toHaveBeenCalledWith("https://liff.example/"));
  });

  it("re-renders the page when only some of the requests were decided", async () => {
    nav.bff.mockResolvedValue(me({ linkRequestsPending: 1, units: [{ unitId: UNIT }], scopes: [`unit:${UNIT}`] }));
    await arrived(() =>
      render(
        <LinkPendingWatch pending={1} unitIds={[UNIT]}>
          <p>more</p>
        </LinkPendingWatch>,
      ),
    );
    expect(nav.refresh).not.toHaveBeenCalled();
    nav.bff.mockResolvedValueOnce(me({ linkRequestsPending: 0, units: [{ unitId: UNIT }], scopes: [`unit:${UNIT}`] }));
    act(() => signalRealtime(LINK_CHANGED_EVENT));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });
});
