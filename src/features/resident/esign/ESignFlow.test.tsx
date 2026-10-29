import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/i18n/messages";
import { ApiError } from "@/lib/api/problem";
import type { ContractDownload } from "@/lib/api/types";

/**
 * Regression tests of the independent review of GL1–GL4 (`review-liff.md`) for the e-signature flow: M1 (a drawing
 * the resident cannot see is never sent), M2 (the reader on screen shows the version whose hash is signed), L1 (the
 * idempotency fingerprint is the drawing's content), L3 (already signed → the page is rendered again), L6 (the PDF
 * link is fetched on every tap).
 */
const nav = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
const liff = vi.hoisted(() => ({ openExternal: vi.fn(async () => undefined) }));
vi.mock("@/lib/liff/client", () => liff);
vi.mock("@/features/resident/lease/signatureImage", () => ({
  SIGNATURE_MAX_BYTES: 200 * 1024,
  fitPng: async (png: Blob) => png,
}));
vi.mock("@/ui/components/SignaturePad", () => ({
  // The pad as the resident sees it: empty on mount (no `initial`), a drawing on tap.
  SignaturePad: ({ onChange }: { onChange: (png: Blob | null) => void }) => (
    <button
      type="button"
      data-testid="pad-draw"
      onClick={() => onChange(new Blob([pad.next()], { type: "image/png" }))}
    >
      draw
    </button>
  ),
  blobToBase64: async (blob: Blob) => btoa(await blob.text()),
}));
vi.mock("@/ui/components/OTPInput", () => ({
  OTPInput: ({ onComplete, disabled }: { onComplete: (value: string) => void; disabled?: boolean }) => (
    <button type="button" data-testid="otp-complete" disabled={disabled} onClick={() => onComplete("123456")}>
      code
    </button>
  ),
}));
vi.mock("@/ui/components/Checkbox", () => ({
  Checkbox: ({ checked, onCheckedChange }: { checked: boolean; onCheckedChange: (value: boolean) => void }) => (
    <input
      type="checkbox"
      data-testid="read-confirm"
      checked={checked}
      onChange={(event) => onCheckedChange(event.target.checked)}
    />
  ),
}));

// Every drawing differs from the last, all of the same length (L1).
const pad = vi.hoisted(() => {
  let count = 0;
  return {
    next: () => `PNG-drawing-${String(++count).padStart(4, "0")}`,
    reset: () => {
      count = 0;
    },
  };
});

import { attemptFingerprint, ESignFlow } from "./ESignFlow";

let messages: Record<string, unknown>;
beforeAll(async () => {
  messages = await loadMessages("en");
});
beforeEach(() => {
  pad.reset();
  // The reader's end marker is on screen at once.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private readonly callback: IntersectionObserverCallback) {}
      observe() {
        this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      disconnect() {}
      unobserve() {}
    },
  );
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const doc = (sha256: string, n = 1): ContractDownload => ({
  documentId: "3b241101-e2bb-4255-8caf-4136c566a962",
  number: "CTR-1",
  sha256,
  signed: false,
  url: `https://storage.example.com/contract-${n}.pdf`,
  expiresAt: "2026-11-01T00:20:00+07:00",
});
const otp = {
  challengeId: "c-1",
  phoneMasked: "08•-•••-1234",
  expiresAt: "2099-01-01T00:00:00Z",
  resendAvailableAt: "2000-01-01T00:00:00Z",
};

interface Setup {
  loads: ContractDownload[];
  renderedSha256?: string | null;
  submit?: (input: unknown, key: string) => Promise<unknown>;
}

function setup({ loads, renderedSha256, submit }: Setup) {
  let index = 0;
  const loadDocument = vi.fn(async () => loads[Math.min(index++, loads.length - 1)]!);
  const requestOtp = vi.fn(async () => otp);
  const submitFn = vi.fn(submit ?? (async () => ({ ok: true })));
  const ui = (sha: string | null | undefined, reader: ReactNode) => (
    <NextIntlClientProvider locale="en" messages={messages} timeZone="Asia/Bangkok">
      <ESignFlow<unknown>
        namespace="resident.contracts.sign"
        reader={reader}
        renderedSha256={sha}
        loadDocument={loadDocument}
        requestOtp={requestOtp}
        submit={submitFn}
        changedCode="contract.changed"
        alreadySignedCode="contract.already_signed"
        renderDone={() => ({ callout: <p data-testid="done-callout">done</p>, actions: null })}
      />
    </NextIntlClientProvider>
  );
  const view = render(ui(renderedSha256, <p>terms v1</p>));
  return {
    loadDocument,
    requestOtp,
    submit: submitFn,
    rerender: (sha: string | null | undefined, reader: ReactNode) => view.rerender(ui(sha, reader)),
  };
}

const flow = () => screen.getByTestId("sign-flow");
const readNext = () => screen.getByTestId("sign-read-next");
const drawNext = () => screen.getByTestId("sign-draw-next");

async function readToTheEnd() {
  const confirm = await screen.findByTestId("read-confirm");
  if (!(confirm as HTMLInputElement).checked) fireEvent.click(confirm);
  await waitFor(() => expect(readNext()).toBeEnabled());
  fireEvent.click(readNext());
  await waitFor(() => expect(flow()).toHaveAttribute("data-step", "draw"));
}

async function drawAndSendCode() {
  fireEvent.click(await screen.findByTestId("pad-draw"));
  await waitFor(() => expect(drawNext()).toBeEnabled());
  fireEvent.click(drawNext());
  const complete = await screen.findByTestId("otp-complete");
  await waitFor(() => expect(complete).toBeEnabled());
  await act(async () => {
    fireEvent.click(complete);
  });
}

describe("M1 — the drawing sent is the one on the pad", () => {
  it("going back to read drops the drawing: Next on the empty pad stays disabled", async () => {
    setup({ loads: [doc(SHA_A)], renderedSha256: SHA_A });
    await readToTheEnd();
    fireEvent.click(await screen.findByTestId("pad-draw"));
    await waitFor(() => expect(drawNext()).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(flow()).toHaveAttribute("data-step", "read"));
    await readToTheEnd();
    await screen.findByTestId("pad-draw");
    expect(drawNext()).toBeDisabled();
  });

  it("a changed document drops the drawing: the signature drawn for the old hash is never posted", async () => {
    const { submit, rerender } = setup({
      loads: [doc(SHA_A), doc(SHA_B)],
      renderedSha256: SHA_A,
      submit: async () => {
        throw new ApiError(409, { code: "contract.changed" });
      },
    });
    await readToTheEnd();
    await drawAndSendCode();
    await waitFor(() => expect(flow()).toHaveAttribute("data-step", "read"));
    expect(submit).toHaveBeenCalledTimes(1);

    rerender(SHA_B, <p>terms v2</p>);
    await waitFor(() => expect(flow()).toHaveAttribute("data-reader", "current"));
    await readToTheEnd();
    await screen.findByTestId("pad-draw");
    expect(drawNext()).toBeDisabled();
  });
});

describe("M2 — the reader shows the version whose hash is signed", () => {
  it("contract.changed renders the page again and waits for the reader of the new hash", async () => {
    const { loadDocument, rerender } = setup({
      loads: [doc(SHA_A), doc(SHA_B)],
      renderedSha256: SHA_A,
      submit: async () => {
        throw new ApiError(409, { code: "contract.changed" });
      },
    });
    await readToTheEnd();
    expect(nav.refresh).not.toHaveBeenCalled();
    await drawAndSendCode();

    await waitFor(() => expect(loadDocument).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    // The new hash is loaded, the reader still shows the old version: no way on.
    fireEvent.click(await screen.findByTestId("read-confirm"));
    expect(flow()).toHaveAttribute("data-reader", "pending");
    expect(readNext()).toBeDisabled();

    rerender(SHA_B, <p data-testid="terms">terms v2</p>);
    expect(screen.getByTestId("terms")).toHaveTextContent("terms v2");
    await waitFor(() => expect(flow()).toHaveAttribute("data-reader", "current"));
    // A new text is read again from the start.
    expect(screen.getByTestId("read-confirm")).not.toBeChecked();
    await readToTheEnd();
  });

  it("edited between the page render and the document fetch: the reader is rendered again before Next", async () => {
    const { rerender } = setup({ loads: [doc(SHA_B)], renderedSha256: SHA_A });
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("sign-updated")).toBeInTheDocument();
    fireEvent.click(await screen.findByTestId("read-confirm"));
    expect(readNext()).toBeDisabled();

    rerender(SHA_B, <p>terms v2</p>);
    await waitFor(() => expect(flow()).toHaveAttribute("data-reader", "current"));
    await readToTheEnd();
  });

  it("a reader re-rendered for yet another version loads the document again", async () => {
    const SHA_C = "c".repeat(64);
    const { loadDocument, rerender } = setup({ loads: [doc(SHA_B), doc(SHA_C)], renderedSha256: SHA_A });
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    rerender(SHA_C, <p>terms v3</p>);
    await waitFor(() => expect(loadDocument).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(flow()).toHaveAttribute("data-reader", "current"));
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it("without a rendered hash (a lease) the page is rendered again once the hash is read", async () => {
    setup({ loads: [doc(SHA_A)], renderedSha256: undefined });
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(flow()).toHaveAttribute("data-reader", "current"));
    await readToTheEnd();
  });

  it("the same hash as rendered needs no new render", async () => {
    setup({ loads: [doc(SHA_A)], renderedSha256: SHA_A });
    await waitFor(() => expect(flow()).toHaveAttribute("data-reader", "current"));
    expect(nav.refresh).not.toHaveBeenCalled();
  });
});

describe("L1 — one key per drawing", () => {
  it("two different drawings of the same length have different fingerprints", async () => {
    const base = { challengeId: "c-1", code: "123456", contractSha256: SHA_A };
    const one = await attemptFingerprint({ ...base, signaturePng: btoa("PNG-drawing-0001") });
    const two = await attemptFingerprint({ ...base, signaturePng: btoa("PNG-drawing-0002") });
    expect(one).not.toBe(two);
    expect(await attemptFingerprint({ ...base, signaturePng: btoa("PNG-drawing-0001") })).toBe(one);
  });

  it("idempotency.key_reused drops the key: the next try sends a new one", async () => {
    let calls = 0;
    const { submit } = setup({
      loads: [doc(SHA_A)],
      renderedSha256: SHA_A,
      submit: async () => {
        calls += 1;
        if (calls === 1) throw new ApiError(422, { code: "idempotency.key_reused" });
        return { ok: true };
      },
    });
    await readToTheEnd();
    await drawAndSendCode();
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    await act(async () => {
      fireEvent.click(screen.getByTestId("otp-complete"));
    });
    await screen.findByTestId("sign-done");
    expect(submit.mock.calls[1]![1]).not.toBe(submit.mock.calls[0]![1]);
  });
});

describe("L3 — already signed", () => {
  it("renders the page again (it shows the signed state)", async () => {
    setup({
      loads: [doc(SHA_A)],
      renderedSha256: SHA_A,
      submit: async () => {
        throw new ApiError(409, { code: "contract.already_signed" });
      },
    });
    await readToTheEnd();
    await drawAndSendCode();
    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
  });
});

describe("L6 — the PDF link is fresh on every tap", () => {
  it("fetches the document again on each tap and opens the new URL", async () => {
    const { loadDocument } = setup({ loads: [doc(SHA_A, 1), doc(SHA_A, 2), doc(SHA_A, 3)], renderedSha256: SHA_A });
    await waitFor(() => expect(screen.getByTestId("sign-open-document")).toBeEnabled());
    expect(loadDocument).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByTestId("sign-open-document"));
    });
    await waitFor(() =>
      expect(liff.openExternal).toHaveBeenLastCalledWith("https://storage.example.com/contract-2.pdf"),
    );
    await waitFor(() => expect(screen.getByTestId("sign-open-document")).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByTestId("sign-open-document"));
    });
    await waitFor(() =>
      expect(liff.openExternal).toHaveBeenLastCalledWith("https://storage.example.com/contract-3.pdf"),
    );
    expect(loadDocument).toHaveBeenCalledTimes(3);
  });

  it("another hash on open is a changed document: read again", async () => {
    setup({ loads: [doc(SHA_A), doc(SHA_B), doc(SHA_B)], renderedSha256: SHA_A });
    await waitFor(() => expect(screen.getByTestId("sign-open-document")).toBeEnabled());
    await act(async () => {
      fireEvent.click(screen.getByTestId("sign-open-document"));
    });
    expect(liff.openExternal).not.toHaveBeenCalled();
    expect(await screen.findByTestId("sign-updated")).toBeInTheDocument();
    await waitFor(() => expect(nav.refresh).toHaveBeenCalled());
    expect(flow()).toHaveAttribute("data-reader", "pending");
  });
});
