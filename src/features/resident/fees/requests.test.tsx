import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/i18n/messages";

/** JL1: the plan request and the debt-clearance request against a scripted API. */
const nav = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
const api = vi.hoisted(() => ({ POST: vi.fn(), GET: vi.fn() }));
vi.mock("@/lib/api/browser", async (original) => ({
  ...(await original<typeof import("@/lib/api/browser")>()),
  browserApi: { POST: api.POST, GET: api.GET },
}));

import { ClearanceRequest } from "./ClearanceRequest";
import { PlanRequestForm } from "./PlanRequestForm";

let messages: Record<string, unknown>;
beforeAll(async () => {
  messages = await loadMessages("en");
});
afterEach(() => vi.clearAllMocks());

const ok = (data: unknown, status = 201) => ({ data, response: new Response(null, { status }) });
const problem = (status: number, code: string, extra: Record<string, unknown> = {}) => ({
  error: { type: `https://errors.getproperty.co/${code}`, title: code, status, code, ...extra },
  response: new Response(null, { status }),
});
const wrap = (node: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Bangkok">
      {node}
    </NextIntlClientProvider>,
  );

describe("PlanRequestForm", () => {
  it("refuses fewer than 2 instalments before calling the API", async () => {
    wrap(<PlanRequestForm unitId="u1" today="2026-11-05" />);
    fireEvent.change(screen.getByTestId("plan-instalments"), { target: { value: "1" } });
    await act(async () => fireEvent.click(screen.getByTestId("plan-submit")));
    expect(screen.getByTestId("plan-form-summary").textContent).toContain("At least 2 instalments");
    expect(api.POST).not.toHaveBeenCalled();
  });

  it("shows the API's limit at the field, then sends one key per request and opens the record", async () => {
    api.POST.mockResolvedValueOnce(
      problem(422, "validation.failed", { errors: [{ path: "instalments", code: "max", message: "2–12 only" }] }),
    ).mockResolvedValueOnce(ok({ id: "plan-1" }));
    wrap(<PlanRequestForm unitId="u1" today="2026-11-05" />);
    fireEvent.change(screen.getByTestId("plan-instalments"), { target: { value: "24" } });
    await act(async () => fireEvent.click(screen.getByTestId("plan-submit")));
    expect(screen.getByText("2–12 only")).toBeTruthy();
    fireEvent.change(screen.getByTestId("plan-instalments"), { target: { value: "6" } });
    await act(async () => fireEvent.click(screen.getByTestId("plan-submit")));
    const [, second] = api.POST.mock.calls;
    expect(second![1].body).toEqual({ instalments: 6, firstDueOn: null, note: null });
    expect(second![1].params.header["Idempotency-Key"]).toBeTruthy();
    expect(nav.push).toHaveBeenCalledWith("/units/u1/payment-plans/plan-1?sent=1");
  });

  it("checks the office's range from the options (CR #45) and names what would be split", async () => {
    const options = {
      minInstalments: 2,
      maxInstalments: 12,
      earliestFirstDueOn: "2026-11-05",
      latestFirstDueOn: "2027-02-05",
      defaultFirstDueOn: "2026-12-01",
      proposedPrincipal: "25500.00",
    };
    wrap(<PlanRequestForm unitId="u1" today="2026-11-05" options={options} />);
    expect(screen.getByTestId("plan-principal").textContent).toContain("25,500.00");
    expect(screen.getByText("Monthly, 2–12 instalments as the office allows.")).toBeTruthy();
    fireEvent.change(screen.getByTestId("plan-instalments"), { target: { value: "13" } });
    fireEvent.change(screen.getByTestId("plan-first-due"), { target: { value: "2027-03-01" } });
    await act(async () => fireEvent.click(screen.getByTestId("plan-submit")));
    const summary = screen.getByTestId("plan-form-summary").textContent;
    expect(summary).toContain("At most 12 instalments");
    expect(summary).toContain("Choose a date no later than");
    expect(api.POST).not.toHaveBeenCalled();
  });

  it("points to the plan already open", async () => {
    api.POST.mockResolvedValueOnce(problem(409, "payment_plan.open_exists"));
    wrap(<PlanRequestForm unitId="u1" today="2026-11-05" />);
    await act(async () => fireEvent.click(screen.getByTestId("plan-submit")));
    expect(screen.getByText("This unit already has a plan")).toBeTruthy();
  });
});

describe("ClearanceRequest", () => {
  const props = { unitId: "u1", unitName: "Unit C-1203", today: "2026-11-05", latest: "2027-01-04" };

  it("turns 409 outstanding into the calm refusal with the amount and pay-first", async () => {
    api.POST.mockResolvedValueOnce(problem(409, "debt_clearance.outstanding", { outstanding: "25500.00" }));
    wrap(<ClearanceRequest {...props} />);
    await act(async () => fireEvent.click(screen.getByTestId("clearance-submit")));
    expect(screen.getByTestId("clearance-outstanding-amount").textContent).toBe("฿25,500.00");
    expect(screen.getByTestId("clearance-pay-first").getAttribute("href")).toBe("/fees");
  });

  it("shows the certificate with the one-time code and its verification link", async () => {
    api.POST.mockResolvedValueOnce(
      ok({
        id: "c1",
        unitId: "u1",
        unitNo: "C-1203",
        state: "issued",
        number: "DCL-2026-00001",
        asOf: "2026-11-05",
        validUntil: "2026-12-05",
        issuedAt: "2026-11-05T10:00:00+07:00",
        partyName: "Som",
        fee: "0.00",
        verifyCode: "GPV001K7Q2",
        verifyCodeHint: "K7Q2",
        refuseReason: null,
      }),
    );
    wrap(<ClearanceRequest {...props} verifyBase="https://console.example" />);
    await act(async () => fireEvent.click(screen.getByTestId("clearance-submit")));
    expect((await screen.findByTestId("clearance-certificate")).getAttribute("data-state")).toBe("issued");
    expect(screen.getByTestId("clearance-code").textContent).toContain("GPV001K7Q2");
  });
});
