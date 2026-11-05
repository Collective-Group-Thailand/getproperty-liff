import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";

import commonEn from "@/i18n/messages/en/shared/common.json";
import errorsEn from "@/i18n/messages/en/shared/errors.json";
import statusEn from "@/i18n/messages/en/shared/status.json";
import feesEn from "@/i18n/messages/en/resident/fees.json";
import commonTh from "@/i18n/messages/th/shared/common.json";
import errorsTh from "@/i18n/messages/th/shared/errors.json";
import statusTh from "@/i18n/messages/th/shared/status.json";
import feesTh from "@/i18n/messages/th/resident/fees.json";
import { ApiError } from "@/lib/api/problem";
import type { DebtClearance, PaymentMandate } from "@/lib/api/types";

import { AutoPay } from "./AutoPay";
import { CertificateView } from "./CertificateView";
import { ClearanceRequest } from "./ClearanceRequest";
import { PlanRequestForm } from "./PlanRequestForm";

/**
 * JL1 — the interactive parts of "my common fees" at 390 px (the paper and the lists are server components, reviewed
 * as screenshots in `_shots/j-JL1`): the plan request, the debt-clearance request with its outcomes, the certificate
 * and auto-pay.
 */
const MESSAGES = {
  th: { common: commonTh, errors: errorsTh, status: statusTh, resident: { fees: feesTh } },
  en: { common: commonEn, errors: errorsEn, status: statusEn, resident: { fees: feesEn } },
};

const router = {
  bfcacheId: "story",
  back: () => undefined,
  forward: () => undefined,
  refresh: () => undefined,
  push: () => undefined,
  replace: () => undefined,
  prefetch: () => undefined,
};

const withIntl: Decorator = (Story, context) => {
  const locale = (context.parameters.locale as "th" | "en" | undefined) ?? "th";
  return (
    <AppRouterContext.Provider value={router}>
      <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Asia/Bangkok">
        <div className="mx-auto flex max-w-[390px] flex-col gap-4 p-4">
          <Story />
        </div>
      </NextIntlClientProvider>
    </AppRouterContext.Provider>
  );
};

const meta: Meta = {
  title: "Resident/Common fees",
  decorators: [withIntl],
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

const issued: DebtClearance = {
  id: "c1",
  unitId: "u1",
  unitNo: "C-1203",
  partyId: "p1",
  partyName: "สมชาย ใจดี",
  asOf: "2026-11-05",
  language: "th",
  requestedVia: "liff",
  fee: "0.00",
  state: "issued",
  number: "DCL-2026-00001",
  documentId: "d1",
  issuedAt: "2026-11-05T10:00:00+07:00",
  validUntil: "2026-12-05",
  verifyCode: "GPV001K7Q2",
  verifyCodeHint: "K7Q2",
  refuseReason: null,
  nextActions: [],
  createdAt: "2026-11-05T10:00:00+07:00",
};

const clearanceProps = { unitId: "u1", unitName: "ห้องชุด C-1203", today: "2026-11-05", latest: "2027-01-04" };

export const PlanRequest: Story = { render: () => <PlanRequestForm unitId="u1" today="2026-11-05" /> };
export const PlanRequestEnglish: Story = {
  parameters: { locale: "en" },
  render: () => <PlanRequestForm unitId="u1" today="2026-11-05" />,
};
export const ClearanceForm: Story = { render: () => <ClearanceRequest {...clearanceProps} /> };
export const ClearanceOutstanding: Story = {
  render: () => <ClearanceRequest {...clearanceProps} initial={{ kind: "outstanding", amount: "25500.00" }} />,
};
export const ClearanceIssued: Story = {
  render: () => (
    <ClearanceRequest
      {...clearanceProps}
      verifyBase="https://console.example"
      initial={{ kind: "issued", clearance: issued }}
    />
  ),
};
export const ClearanceWaitingForFee: Story = {
  render: () => (
    <CertificateView
      clearance={{
        ...issued,
        state: "requested",
        number: null,
        issuedAt: null,
        validUntil: null,
        verifyCode: null,
        verifyCodeHint: null,
        fee: "500.00",
      }}
      unitName="ห้องชุด C-1203"
      locale="th"
    />
  ),
};
export const ClearanceProblem: Story = {
  render: () => (
    <ClearanceRequest
      {...clearanceProps}
      initial={{
        kind: "problem",
        error: new ApiError(403, { code: "auth.forbidden", title: "ไม่มีสิทธิ์", detail: "เฉพาะเจ้าของร่วม" }),
      }}
    />
  ),
};

const mandate: PaymentMandate = {
  id: "m1",
  unitId: "u1",
  unitNo: "C-1203",
  partyId: "p1",
  method: "direct_debit",
  provider: "fake",
  scope: "advance_invoices",
  state: "active",
  masked: "xxx-x-x5678-x",
  activatedAt: "2026-09-01T10:00:00+07:00",
  createdAt: "2026-09-01T10:00:00+07:00",
  endedAt: null,
  endReason: null,
};
export const AutoPaySetup: Story = { render: () => <AutoPay unitId="u1" mandates={[]} locale="th" /> };
export const AutoPayActive: Story = { render: () => <AutoPay unitId="u1" mandates={[mandate]} locale="th" /> };
export const AutoPayPending: Story = {
  render: () => <AutoPay unitId="u1" mandates={[{ ...mandate, state: "pending", masked: null }]} locale="th" />,
};
export const AutoPayUnavailable: Story = {
  render: () => <AutoPay unitId="u1" mandates={[]} locale="th" initialUnavailable />,
};
