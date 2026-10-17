import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => ({
  supported: vi.fn(() => true),
  subscribe: vi.fn(async () => "subscribed" as const),
  inLine: vi.fn(async () => false),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/liff/client", () => ({ inLineClient: push.inLine }));
vi.mock("@/lib/pwa/push", () => ({ pushSupported: push.supported, subscribeToPush: push.subscribe }));

import { PUSH_OFFER_KEY, PushOffer } from "./PushOffer";

describe("push offer after the first payment (L1 1.3 §4, L2)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal("Notification", { permission: "default" });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("is offered once, outside LINE, and subscribes on accept", async () => {
    render(<PushOffer vapidKey="BKey" />);
    const accept = await screen.findByTestId("push-offer-accept");
    expect(localStorage.getItem(PUSH_OFFER_KEY)).toBe("shown");
    await act(async () => fireEvent.click(accept));
    expect(push.subscribe).toHaveBeenCalledWith("BKey");
    expect(await screen.findByText("on")).toBeInTheDocument();
    expect(localStorage.getItem(PUSH_OFFER_KEY)).toBe("subscribed");
  });

  it("is not offered again, inside LINE, or when the permission was already answered", async () => {
    localStorage.setItem(PUSH_OFFER_KEY, "declined");
    const first = render(<PushOffer vapidKey="BKey" />);
    await waitFor(() => expect(push.inLine).toHaveBeenCalled());
    expect(screen.queryByTestId("push-offer")).toBeNull();
    first.unmount();

    localStorage.clear();
    push.supported.mockReturnValueOnce(false);
    const second = render(<PushOffer vapidKey="BKey" />);
    await waitFor(() => expect(push.supported).toHaveBeenCalled());
    expect(screen.queryByTestId("push-offer")).toBeNull();
    second.unmount();

    vi.stubGlobal("Notification", { permission: "denied" });
    render(<PushOffer vapidKey="BKey" />);
    await waitFor(() => expect(push.supported).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("push-offer")).toBeNull();
    expect(localStorage.getItem(PUSH_OFFER_KEY)).toBeNull();
  });

  it("remembers a decline", async () => {
    render(<PushOffer vapidKey="BKey" />);
    fireEvent.click(await screen.findByText("decline"));
    expect(screen.queryByTestId("push-offer")).toBeNull();
    expect(localStorage.getItem(PUSH_OFFER_KEY)).toBe("declined");
  });
});
