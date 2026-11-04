import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/i18n/messages";
import type { UnitInvitationPreview } from "@/lib/api/types";

/** JRL: the redeem flow against a scripted API — every answer lands on its designed screen. */
const nav = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
const api = vi.hoisted(() => ({ POST: vi.fn(), bffJson: vi.fn(async () => undefined) }));
vi.mock("@/lib/api/browser", async (original) => ({
  ...(await original<typeof import("@/lib/api/browser")>()),
  browserApi: { POST: api.POST },
  bffJson: api.bffJson,
}));
vi.mock("@/ui/components/OTPInput", () => ({
  OTPInput: ({ onComplete, disabled }: { onComplete: (value: string) => void; disabled?: boolean }) => (
    <button type="button" data-testid="otp-complete" disabled={disabled} onClick={() => onComplete("123456")}>
      code
    </button>
  ),
}));

import { UnitRedeem } from "./UnitRedeem";

let messages: Record<string, unknown>;
beforeAll(async () => {
  messages = await loadMessages("en");
});
afterEach(() => {
  vi.clearAllMocks();
  document.cookie = "gp_unit=; max-age=0; path=/";
});

const preview: UnitInvitationPreview = {
  tenantName: "Sample Condo Juristic Person",
  buildingName: "Building C",
  unitNo: "C-1203",
  partyDisplayName: "Som••••••",
  phoneMasked: "+66•••••1234",
  expiresAt: "2026-11-19T10:00:00+07:00",
};
const sent = {
  challengeId: "c-1",
  phoneMasked: "+66•••••1234",
  expiresAt: "2099-01-01T00:00:00Z",
  resendAvailableAt: "2000-01-01T00:00:00Z",
};
const ok = (data: unknown, status = 200) => ({ data, response: new Response(null, { status }) });
const problem = (status: number, code: string, extra: Record<string, unknown> = {}) => ({
  error: { type: `https://errors.getproperty.co/${code}`, title: code, status, code, ...extra },
  response: new Response(null, { status }),
});

function renderFlow() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Bangkok">
      <UnitRedeem code="OWN-OK-1" preview={preview} />
    </NextIntlClientProvider>,
  );
}

async function sendCode() {
  await act(async () => {
    fireEvent.click(screen.getByTestId("unit-redeem-send"));
  });
}

async function enterCode() {
  await act(async () => {
    fireEvent.click(await screen.findByTestId("otp-complete"));
  });
}

describe("UnitRedeem (JRL)", () => {
  it("previews the unit, sends the code, links, refreshes the session and remembers the unit", async () => {
    api.POST.mockImplementation(async (path: string) =>
      path.endsWith("/otp")
        ? ok(sent, 201)
        : ok({ tenantId: "t", unitId: "unit-c", partyId: "p", refreshRequired: true, acceptedOn: "2026-11-05" }),
    );
    renderFlow();
    expect(screen.getByTestId("unit-redeem-preview")).toHaveTextContent("Unit C-1203");
    expect(screen.getByTestId("unit-redeem-preview")).toHaveTextContent("+66•••••1234");
    await sendCode();
    await enterCode();
    await screen.findByTestId("unit-redeem-done");
    const accept = api.POST.mock.calls.find(([path]) => String(path).endsWith("/accept"))!;
    expect(accept[1]).toMatchObject({
      params: { path: { code: "OWN-OK-1" } },
      body: { challengeId: "c-1", code: "123456" },
    });
    expect(accept[1].params.header["Idempotency-Key"]).toEqual(expect.any(String));
    expect(api.bffJson).toHaveBeenCalledWith("/auth/refresh", { method: "POST" });
    expect(document.cookie).toContain("gp_unit=unit-c");
    fireEvent.click(screen.getByTestId("unit-redeem-continue"));
    expect(nav.replace).toHaveBeenCalledWith("/");
  });

  it("a wrong code says how many tries are left and lets the resident try again", async () => {
    api.POST.mockImplementation(async (path: string) =>
      path.endsWith("/otp") ? ok(sent, 201) : problem(401, "auth.otp_invalid", { attemptsRemaining: 2 }),
    );
    renderFlow();
    await sendCode();
    await enterCode();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("2 tries left"));
    expect(screen.getByTestId("otp-complete")).toBeEnabled();
  });

  it("an expired code asks for a new one; the code field is closed until then", async () => {
    api.POST.mockImplementation(async (path: string) =>
      path.endsWith("/otp") ? ok(sent, 201) : problem(401, "auth.otp_expired"),
    );
    renderFlow();
    await sendCode();
    await enterCode();
    await waitFor(() => expect(screen.getByText("The code has expired")).toBeInTheDocument());
    expect(screen.getByTestId("otp-complete")).toBeDisabled();
    expect(screen.getByTestId("unit-redeem-resend")).toBeEnabled();
  });

  it("a code already used closes the flow with its own screen", async () => {
    api.POST.mockImplementation(async (path: string) =>
      path.endsWith("/otp") ? ok(sent, 201) : problem(409, "invitation.not_pending"),
    );
    renderFlow();
    await sendCode();
    await enterCode();
    const closed = await screen.findByTestId("unit-redeem-closed");
    expect(closed).toHaveAttribute("data-problem", "notPending");
    expect(closed).toHaveTextContent("This invitation can no longer be used");
  });

  it("no phone on the register: the office has to add it first", async () => {
    api.POST.mockResolvedValue(problem(422, "invitation.phone_missing"));
    renderFlow();
    await sendCode();
    expect(await screen.findByTestId("unit-redeem-closed")).toHaveAttribute("data-problem", "phoneMissing");
  });

  it("missing consents go through the consent screen and back", async () => {
    api.POST.mockImplementation(async (path: string) =>
      path.endsWith("/otp") ? ok(sent, 201) : problem(409, "consent.required"),
    );
    renderFlow();
    await sendCode();
    await enterCode();
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith(`/consent?next=${encodeURIComponent("/link/unit?code=OWN-OK-1")}`),
    );
  });
});
