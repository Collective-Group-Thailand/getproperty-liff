import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/i18n/messages";
import type { OpenableGate, ResidentVisit } from "@/lib/api/types";

/** JL4: the visitor answer (deep link confirm, first answer wins), hold-to-confirm, the invite form, the house policy
 *  by role and the barrier's states — against a scripted API. */
const nav = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
const api = vi.hoisted(() => ({ POST: vi.fn(), GET: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() }));
vi.mock("@/lib/api/browser", async (original) => ({
  ...(await original<typeof import("@/lib/api/browser")>()),
  browserApi: { POST: api.POST, GET: api.GET, PUT: api.PUT, DELETE: api.DELETE },
}));

import { HoldToConfirm } from "../sos/HoldToConfirm";
import SosSheet from "../sos/SosSheet";
import { HOLD_MS } from "../sos/hold";
import { OPENING_MS } from "./gateOpen";
import { InviteForm } from "./InviteForm";
import { OpenBarrier } from "./OpenBarrier";
import { PolicyForm } from "./PolicyForm";
import { VisitAnswer } from "./VisitAnswer";

let messages: Record<string, unknown>;
beforeAll(async () => {
  messages = await loadMessages("en");
});
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

const ok = (data: unknown, status = 200, headers: Record<string, string> = {}) => ({
  data,
  response: new Response(null, { status, headers }),
});
const problem = (
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
) => ({
  error: { type: `https://errors.getproperty.co/${code}`, title: code, status, code, ...extra },
  response: new Response(null, { status, headers }),
});
const wrap = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Bangkok">
      {node}
    </NextIntlClientProvider>,
  );

const visit: ResidentVisit = {
  id: "v1",
  gateId: "g1",
  gateName: "Gate 1",
  unitId: "u1",
  unitNo: "88/12",
  kind: "guest",
  state: "requested",
  entryBasis: null,
  plate: { category: "3กท", number: "8812", province: "กรุงเทพมหานคร" },
  visitorName: "Thana",
  hasPhoto: false,
  respondBy: "2099-01-01T00:03:00+07:00",
  timeoutAction: "guard_calls",
  decidedAt: null,
  decisionReason: null,
  callMeAt: null,
  enteredAt: null,
  exitedAt: null,
  exitedBy: null,
  cancelledAt: null,
  createdAt: "2099-01-01T00:00:00+07:00",
  decidedByName: null,
  policy: {
    action: "guard_calls",
    custom: false,
    deliverySkipApproval: null,
    householdNote: null,
    timeoutSeconds: 180,
  },
  photoUrl: null,
};
const answerProps = { me: "Somchai", rememberDays: 30, minutes: 3, locale: "en" as const };

describe("VisitAnswer", () => {
  it("a LINE button never acts: it opens the confirmation naming the plate, and only the confirm answers", async () => {
    api.POST.mockResolvedValueOnce(
      ok({
        accepted: true,
        visit: { ...visit, state: "approved", decidedByName: "Somchai", decidedAt: visit.createdAt },
      }),
    );
    wrap(<VisitAnswer visit={visit} answer="approve" {...answerProps} />);
    expect(await screen.findByText("Let 3กท 8812 in?")).toBeTruthy();
    expect(api.POST).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getAllByRole("button", { name: "Let them in" }).at(-1)!));
    expect(api.POST).toHaveBeenCalledTimes(1);
    const [path, init] = api.POST.mock.calls[0]!;
    expect(path).toBe("/v1/resident/visits/{visitId}/actions/approve");
    expect(init.body).toEqual({ rememberVehicle: false });
    expect((await screen.findByTestId("visit-result")).getAttribute("data-result")).toBe("approved");
    expect(screen.getByText("You let them in")).toBeTruthy();
  });

  it("remembers the car only when ticked", async () => {
    api.POST.mockResolvedValueOnce(
      ok({ accepted: true, visit: { ...visit, state: "approved", decidedByName: "Somchai" } }),
    );
    wrap(<VisitAnswer visit={visit} answer={null} {...answerProps} />);
    expect(screen.getByText("Remember this car for 30 days")).toBeTruthy();
    fireEvent.click(screen.getByTestId("visit-remember"));
    await act(async () => fireEvent.click(screen.getByTestId("visit-approve")));
    expect(api.POST.mock.calls[0]![1].body).toEqual({ rememberVehicle: true });
  });

  it("someone else answered first: the card names them and says mine was not used", async () => {
    api.POST.mockResolvedValueOnce(
      ok({
        accepted: false,
        visit: { ...visit, state: "approved", decidedByName: "Wipa", decidedAt: visit.createdAt },
      }),
    );
    wrap(<VisitAnswer visit={visit} answer={null} {...answerProps} />);
    await act(async () => fireEvent.click(screen.getByTestId("visit-deny")));
    expect((await screen.findByTestId("visit-result")).getAttribute("data-someone-else")).toBe("true");
    expect(screen.getByText("Wipa let them in")).toBeTruthy();
    expect(screen.queryByTestId("visit-actions")).toBeNull();
  });

  it("a link to a visit already answered shows the result, no confirmation", async () => {
    wrap(
      <VisitAnswer
        visit={{ ...visit, state: "timed_out", decidedAt: visit.respondBy }}
        answer="deny"
        {...answerProps}
      />,
    );
    expect(screen.getByTestId("visit-link-answered")).toBeTruthy();
    expect(await screen.findByText("No answer in 3 min — the guard is calling the household")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("HoldToConfirm", () => {
  const confirm = { title: "Report?", body: "Every gate is alerted.", confirmLabel: "Send", cancelLabel: "Not now" };
  const setup = (onConfirm = vi.fn()) => {
    wrap(
      <HoldToConfirm
        label="Hold"
        holdingLabel="Keep holding"
        tapHint="Hold until full"
        accessibleLabel="Send with confirmation"
        confirm={confirm}
        onConfirm={onConfirm}
        testId="h"
      />,
    );
    return { onConfirm, surface: screen.getByTestId("h-surface") };
  };

  it("sends only after 1.5 s held; releasing earlier cancels", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance"] });
    const { onConfirm, surface } = setup();
    fireEvent.pointerDown(surface, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(HOLD_MS - 300));
    expect(screen.getByTestId("h").getAttribute("data-phase")).toBe("holding");
    fireEvent.pointerUp(surface, { pointerId: 1 });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByTestId("h").getAttribute("data-phase")).toBe("idle");

    fireEvent.pointerDown(surface, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(HOLD_MS + 100));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(surface, { pointerId: 1 });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("a quick tap explains the hold instead of sending", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "performance"] });
    const { onConfirm, surface } = setup();
    fireEvent.pointerDown(surface, { pointerId: 1 });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.pointerUp(surface, { pointerId: 1 });
    expect(screen.getByTestId("h-hint").textContent).toBe("Hold until full");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("keyboard and screen readers get a confirm dialog; the hold surface is hidden from them", async () => {
    const { onConfirm, surface } = setup();
    expect(surface.getAttribute("aria-hidden")).toBe("true");
    expect(surface.getAttribute("tabindex")).toBe("-1");
    fireEvent.click(screen.getByTestId("h-accessible"));
    expect(await screen.findByText("Report?")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Send" })));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe("InviteForm", () => {
  const props = { unitId: "u1", unitName: "House 88/12", place: "Lalita Village", locale: "en" as const };
  const now = Date.parse("2099-01-01T09:07:00+07:00");

  it("checks the window before calling the API and lists what to fix", async () => {
    wrap(<InviteForm {...props} now={now} />);
    fireEvent.change(screen.getByTestId("invite-to-time"), { target: { value: "08:00" } });
    await act(async () => fireEvent.click(screen.getByTestId("invite-submit")));
    expect(await screen.findByText("Until")).toBeTruthy();
    expect(screen.getByTestId("invite-summary")).toBeTruthy();
    expect(screen.getByText("The end must be after the start")).toBeTruthy();
    expect(api.POST).not.toHaveBeenCalled();
  });

  it("names every control by its visible label, keeping the summary's anchor ids (axe `label`)", async () => {
    wrap(<InviteForm {...props} now={now} />);
    fireEvent.click(screen.getByTestId("invite-usage-multi"));
    fireEvent.click(screen.getByTestId("invite-plate-open"));
    expect(await screen.findByRole("combobox", { name: "Province" })).toHaveAttribute("id", "invite-plate-province");
    expect(screen.getByRole("textbox", { name: "Letters" })).toHaveAttribute("id", "invite-plate-category");
    expect(screen.getByRole("textbox", { name: "Number" })).toHaveAttribute("id", "invite-plate-number");
    expect(screen.getByLabelText("From")).toHaveAttribute("id", "invite-fromDate");
    expect(screen.getByLabelText("Until")).toHaveAttribute("id", "invite-toDate");
    expect(screen.getByRole("textbox", { name: "Number of times" })).toHaveAttribute("id", "invite-maxUses");
    expect(screen.getByRole("textbox", { name: "Visitor's name (optional)" })).toHaveAttribute(
      "id",
      "invite-visitorName",
    );
    expect(screen.getByRole("textbox", { name: "Note for the gate (optional)" })).toHaveAttribute("id", "invite-note");
  });

  it("moves the focus to the summary once it is on screen (not on a frame that may come before the render)", async () => {
    wrap(<InviteForm {...props} now={now} />);
    fireEvent.change(screen.getByTestId("invite-to-time"), { target: { value: "08:00" } });
    await act(async () => fireEvent.click(screen.getByTestId("invite-submit")));
    expect(screen.getByTestId("invite-summary")).toHaveFocus();
    // A second failed submit focuses it again.
    screen.getByTestId("invite-submit").focus();
    await act(async () => fireEvent.click(screen.getByTestId("invite-submit")));
    expect(screen.getByTestId("invite-summary")).toHaveFocus();
  });

  it("sends the pass with a key, shows the API's longest window at the field", async () => {
    api.POST.mockResolvedValueOnce(problem(422, "visit_invite.window_too_long", { params: { days: 30 } }));
    wrap(<InviteForm {...props} now={now} />);
    fireEvent.click(screen.getByTestId("invite-kind-contractor"));
    expect(screen.getByTestId("invite-contractor-note")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByTestId("invite-submit")));
    const [path, init] = api.POST.mock.calls[0]!;
    expect(path).toBe("/v1/resident/units/{unitId}/visit-invites");
    expect(init.params.header["Idempotency-Key"]).toBeTruthy();
    expect(init.body).toMatchObject({
      usage: "single",
      visitorKind: "contractor",
      validFrom: "2099-01-01T09:15:00+07:00",
      validTo: "2099-01-01T13:15:00+07:00",
    });
    expect(screen.getByText("At most 30 days")).toBeTruthy();
  });
});

describe("InviteForm idempotency (review L1)", () => {
  const props = { unitId: "u1", unitName: "House 88/12", place: "Lalita Village", locale: "en" as const };
  const now = Date.parse("2099-01-01T09:07:00+07:00");
  const keyOf = (n: number) => api.POST.mock.calls[n]![1].params.header["Idempotency-Key"] as string;
  const submit = () => act(async () => fireEvent.click(screen.getByTestId("invite-submit")));

  it("keeps the pass's key after a lost answer or a 5xx; a refusal or a changed pass gets a new one", async () => {
    api.POST.mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(problem(503, "service.unavailable"))
      .mockResolvedValueOnce(problem(422, "validation.failed"))
      .mockResolvedValueOnce(problem(503, "service.unavailable"))
      .mockResolvedValueOnce(problem(503, "service.unavailable"));
    wrap(<InviteForm {...props} now={now} />);
    await submit();
    await submit();
    expect(keyOf(1)).toBe(keyOf(0)); // network failure, then 503: the same pass, the same key
    await submit();
    expect(keyOf(2)).toBe(keyOf(0));
    await submit(); // after the 422 refusal: a new action
    expect(keyOf(3)).not.toBe(keyOf(0));
    fireEvent.change(screen.getByRole("textbox", { name: "Visitor's name (optional)" }), {
      target: { value: "Thana" },
    });
    await submit(); // another pass (name changed): a new key
    expect(keyOf(4)).not.toBe(keyOf(3));
    expect(api.POST.mock.calls[4]![1].body).toMatchObject({ visitorName: "Thana" });
  });
});

describe("SosSheet idempotency (review L2)", () => {
  const send = async () => {
    fireEvent.click(screen.getByTestId("sos-hold-accessible"));
    await act(async () => fireEvent.click(await screen.findByRole("button", { name: "Send emergency" })));
  };
  const keyOf = (n: number) => api.POST.mock.calls[n]![1].params.header["Idempotency-Key"] as string;
  const props = { open: true, onOpenChange: vi.fn(), unitId: "u1", unitName: "House 88/12" };

  it("one key per emergency {unit, kind, note}: a retry reuses it, another kind or note does not", async () => {
    api.POST.mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(ok({ id: "s1", existing: false }, 201));
    wrap(<SosSheet {...props} />);
    fireEvent.click(screen.getByTestId("sos-kind-medical"));
    await send();
    await send();
    expect(keyOf(1)).toBe(keyOf(0));
    fireEvent.change(screen.getByTestId("sos-note"), { target: { value: "upstairs" } });
    await send();
    expect(keyOf(2)).not.toBe(keyOf(0));
    expect(api.POST.mock.calls[2]![1].body).toEqual({ unitId: "u1", kind: "medical", note: "upstairs" });
    expect(nav.push).toHaveBeenCalledWith("/sos/s1");
  });

  it("idempotency.key_reused → sent again with a new key; the open SOS comes back (existing)", async () => {
    api.POST.mockResolvedValueOnce(problem(422, "idempotency.key_reused")).mockResolvedValueOnce(
      ok({ id: "s9", existing: true }, 200),
    );
    wrap(<SosSheet {...props} />);
    fireEvent.click(screen.getByTestId("sos-kind-fire"));
    await send();
    expect(api.POST).toHaveBeenCalledTimes(2);
    expect(keyOf(1)).not.toBe(keyOf(0));
    expect(api.POST.mock.calls[1]![1].body).toEqual(api.POST.mock.calls[0]![1].body);
    expect(nav.push).toHaveBeenCalledWith("/sos/s9?existing=1");
  });
});

describe("PolicyForm by role", () => {
  const policy = {
    action: "guard_calls" as const,
    custom: false,
    deliverySkipApproval: null,
    householdNote: null,
    timeoutSeconds: 180,
  };

  it("family reads the agreement and who can change it", () => {
    wrap(<PolicyForm unitId="u1" policy={policy} canEdit={false} />);
    expect(screen.getByTestId("policy-readonly").textContent).toContain("3 min");
    expect(screen.getByText("A co-owner or renter changes this agreement")).toBeTruthy();
    expect(screen.queryByTestId("policy-form")).toBeNull();
  });

  it("the household saves timeout, action, deliveries and the note", async () => {
    api.PUT.mockResolvedValueOnce(ok({}));
    wrap(<PolicyForm unitId="u1" policy={policy} canEdit />);
    fireEvent.click(screen.getByTestId("policy-wait-5"));
    fireEvent.click(screen.getByTestId("policy-action-allow_and_log"));
    fireEvent.change(screen.getByTestId("policy-note"), { target: { value: " Ring the bell " } });
    await act(async () => fireEvent.click(screen.getByTestId("policy-save")));
    expect(api.PUT.mock.calls[0]![1].body).toEqual({
      timeoutSeconds: 300,
      action: "allow_and_log",
      deliverySkipApproval: null,
      householdNote: "Ring the bell",
    });
    expect(screen.getByTestId("policy-saved").textContent).toContain("Saved");
  });
});

describe("OpenBarrier", () => {
  const car = {
    id: "c1",
    unitId: "u1",
    plate: { category: "8กร", number: "1288", province: "กรุงเทพมหานคร" },
    label: "My car",
    createdAt: "x",
  };
  const gate: OpenableGate = {
    gateId: "g1",
    name: "Gate 1",
    kind: "main",
    propertyId: "p1",
    propertyName: "Lalita",
    enabled: true,
    requireGeofence: false,
    vehicles: [car],
  };

  it("202 → opening, and the button rests while it opens", async () => {
    api.POST.mockResolvedValueOnce(ok({ gateId: "g1", commands: [] }, 202));
    wrap(<OpenBarrier gates={[gate]} locale="en" />);
    await act(async () => fireEvent.click(screen.getByTestId("open-barrier-button")));
    expect(api.POST.mock.calls[0]![1].body).toEqual({ vehicleId: "c1" });
    expect(screen.getByTestId("open-barrier").getAttribute("data-state")).toBe("opening");
    // A second press while opening is refused by the button itself.
    expect((screen.getByTestId("open-barrier-button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("maps a 429 to the wait and a switched-off estate to its reason", async () => {
    api.POST.mockResolvedValueOnce(problem(429, "gate.open_rate_limited", {}, { "retry-after": "3" }));
    const view = wrap(<OpenBarrier gates={[gate]} locale="en" />);
    await act(async () => fireEvent.click(screen.getByTestId("open-barrier-button")));
    expect(screen.getByTestId("open-status").textContent).toMatch(/wait 3 s/);
    view.unmount();
    api.POST.mockResolvedValueOnce(problem(403, "gate.resident_open_disabled"));
    wrap(<OpenBarrier gates={[gate]} locale="en" />);
    await act(async () => fireEvent.click(screen.getByTestId("open-barrier-button")));
    expect(screen.getByTestId("open-status").getAttribute("data-kind")).toBe("not_allowed");
  });

  it("one key per press intent (gate + car) for ~30 s: a retry after a lost answer reuses it (review L3)", async () => {
    const keyOf = (n: number) => api.POST.mock.calls[n]![1].params?.header?.["Idempotency-Key"] as string | undefined;
    api.POST.mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(problem(503, "service.unavailable"))
      .mockResolvedValueOnce(ok({ gateId: "g1", commands: [] }, 202))
      .mockResolvedValueOnce(problem(503, "service.unavailable"))
      .mockResolvedValueOnce(problem(503, "service.unavailable"));
    const now = vi.spyOn(Date, "now");
    let clock = Date.parse("2099-01-01T09:00:00+07:00");
    now.mockImplementation(() => clock);
    const press = () => act(async () => fireEvent.click(screen.getByTestId("open-barrier-button")));
    wrap(<OpenBarrier gates={[gate]} locale="en" />);
    await press();
    await press();
    expect(keyOf(0)).toBeTruthy();
    expect(keyOf(1)).toBe(keyOf(0));
    await press(); // 202: the action is done
    expect(keyOf(2)).toBe(keyOf(0));
    clock += OPENING_MS + 1;
    await act(() => new Promise((resolve) => setTimeout(resolve, 300))); // one tick: opening → sent
    await press(); // a new press after the open: a new key
    expect(keyOf(3)).not.toBe(keyOf(0));
    clock += 31_000; // the same intent more than 30 s later is a new press
    await press();
    expect(keyOf(4)).not.toBe(keyOf(3));
    now.mockRestore();
  });

  it("asks for the location only when the estate requires it, and says so when refused", async () => {
    const getCurrentPosition = vi.fn((_ok: PositionCallback, fail: PositionErrorCallback) =>
      fail({ code: 1, message: "denied" } as GeolocationPositionError),
    );
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition }, configurable: true });
    wrap(<OpenBarrier gates={[{ ...gate, requireGeofence: true }]} locale="en" />);
    expect(screen.getByTestId("open-geofence")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByTestId("open-barrier-button")));
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(api.POST).not.toHaveBeenCalled();
    expect(screen.getByTestId("open-status").getAttribute("data-kind")).toBe("location_denied");
  });
});
