import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/i18n/messages";

import type { RedeemState } from "./redeem";
import { UnitRedeemView } from "./UnitRedeemView";

/** J deferred e2e: the code boxes are disabled while the code is checked, so a wrong code must give the focus back. */
let messages: Record<string, unknown>;
beforeAll(async () => {
  messages = await loadMessages("en");
});

const challenge = {
  challengeId: "c-1",
  phoneMasked: "+66•••••1234",
  expiresAt: "2099-01-01T00:00:00Z",
  resendAvailableAt: "2000-01-01T00:00:00Z",
} as Extract<RedeemState, { step: "code" }>["challenge"];

function view(state: RedeemState) {
  return (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Bangkok">
      <UnitRedeemView
        preview={null}
        state={state}
        digits=""
        resendIn={0}
        locale="en"
        onDigits={vi.fn()}
        onSend={vi.fn()}
        onVerify={vi.fn()}
        onContinue={vi.fn()}
      />
    </NextIntlClientProvider>
  );
}

describe("UnitRedeemView — the code step", () => {
  it("a wrong code puts the focus back in the first box, ready for the next try", () => {
    const { rerender } = render(view({ step: "verifying", challenge }));
    expect(screen.getByLabelText("Digit 1")).toBeDisabled();
    rerender(
      view({
        step: "code",
        challenge,
        problem: { kind: "wrongCode", code: "auth.otp_invalid", attemptsRemaining: 4 } as Extract<
          RedeemState,
          { step: "code" }
        >["problem"],
      }),
    );
    expect(screen.getByLabelText("Digit 1")).toHaveFocus();
  });
});
