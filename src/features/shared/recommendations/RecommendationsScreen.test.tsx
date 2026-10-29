import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/i18n/messages";

import { example } from "../../../../mocks/contract";
import type { Recommendations } from "./model";

/**
 * Review G, M3 (D-025 / D-300 (1)): stopping is as easy as agreeing — the one-tap stop is offered whenever an
 * agreement is on file, also when it is for an earlier version of the text ("outdated").
 */
const store = vi.hoisted(() => ({ messages: {} as Record<string, unknown> }));
vi.mock("next-intl/server", async () => {
  const { createTranslator: translator } = await import("next-intl");
  return {
    getTranslations: async (namespace?: string) =>
      translator({ locale: "en", messages: store.messages, namespace: namespace as never }),
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("./ConsentText", () => ({ ConsentText: () => null }));
vi.mock("./LazyPreferencesForm", () => ({ LazyPreferencesForm: () => null }));

import { RecommendationsScreen } from "./RecommendationsScreen";

beforeAll(async () => {
  store.messages = await loadMessages("en");
});

const data = (consent: Partial<Recommendations["consent"]>): Recommendations => {
  const base = example<Recommendations>("resident.recommendations.get");
  return { ...base, preferences: null, consent: { ...base.consent, ...consent } };
};

async function show(consent: Partial<Recommendations["consent"]>) {
  const ui = await RecommendationsScreen({
    audience: "resident",
    data: data(consent),
    areas: [],
    history: { items: [], total: 0 },
    locale: "en",
    notice: null,
  });
  render(
    <NextIntlClientProvider locale="en" messages={store.messages} timeZone="Asia/Bangkok">
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("RecommendationsScreen — the stop button (M3)", () => {
  it("is offered while the agreement on file is for an earlier version of the text", async () => {
    await show({ granted: false, grantedVersion: 1, version: 2 });
    expect(screen.getByTestId("recommendations")).toHaveAttribute("data-state", "outdated");
    expect(screen.getByTestId("recommendations-withdraw")).toBeInTheDocument();
    const status = (store.messages.recommendations as { status: { outdated: { stopHint: string } } }).status;
    expect(screen.getByText(status.outdated.stopHint)).toBeInTheDocument();
  });

  it("is offered while on", async () => {
    await show({ granted: true, grantedVersion: 1, version: 1, capturedAt: "2026-10-28T09:00:00+07:00" });
    expect(screen.getByTestId("recommendations-withdraw")).toBeInTheDocument();
  });

  it("is not offered when nothing is on file", async () => {
    await show({ granted: false, grantedVersion: null, version: 2 });
    expect(screen.queryByTestId("recommendations-withdraw")).toBeNull();
  });
});
