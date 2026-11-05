import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { NextIntlClientProvider } from "next-intl";

import commonEn from "@/i18n/messages/en/shared/common.json";
import errorsEn from "@/i18n/messages/en/shared/errors.json";
import linkEn from "@/i18n/messages/en/resident/link.json";
import commonTh from "@/i18n/messages/th/shared/common.json";
import errorsTh from "@/i18n/messages/th/shared/errors.json";
import linkTh from "@/i18n/messages/th/resident/link.json";

import { redeemProblem } from "./redeem";
import { UnitRedeemView, type UnitRedeemViewProps } from "./UnitRedeemView";

/** JRL: the co-owner's unit invitation, one story per designed step and refusal (360 px phone). */
const MESSAGES = {
  th: { common: commonTh, errors: errorsTh, resident: { link: linkTh } },
  en: { common: commonEn, errors: errorsEn, resident: { link: linkEn } },
};

const withIntl: Decorator = (Story, context) => {
  const locale = (context.parameters.locale as "th" | "en" | undefined) ?? "th";
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Asia/Bangkok">
      <div className="mx-auto flex max-w-[390px] flex-col">
        <Story />
      </div>
    </NextIntlClientProvider>
  );
};

const noop = () => undefined;
const preview = {
  propertyKind: "condo" as const,
  legalForm: "condo_act" as const,
  tenantName: "นิติบุคคลอาคารชุด ตัวอย่าง คอนโด",
  buildingName: "อาคาร C",
  unitNo: "C-1203",
  partyDisplayName: "สม••••••",
  phoneMasked: "+66•••••1234",
  expiresAt: "2026-11-19T10:00:00+07:00",
};
const challenge = {
  challengeId: "c-1",
  phoneMasked: "+66•••••1234",
  expiresAt: "2026-11-05T10:05:00+07:00",
  resendAvailableAt: "2026-11-05T10:01:00+07:00",
};

const base: UnitRedeemViewProps = {
  preview,
  state: { step: "preview", problem: null },
  digits: "",
  resendIn: 0,
  locale: "th",
  onDigits: noop,
  onSend: noop,
  onVerify: noop,
  onContinue: noop,
};

const meta = {
  title: "Resident/Unit invitation",
  component: UnitRedeemView,
  decorators: [withIntl],
  args: base,
} satisfies Meta<typeof UnitRedeemView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Preview: Story = {};

export const PreviewEnglish: Story = { parameters: { locale: "en" }, args: { locale: "en" } };

export const Code: Story = {
  args: { state: { step: "code", challenge, problem: null }, digits: "12", resendIn: 42 },
};

export const WrongCode: Story = {
  args: { state: { step: "code", challenge, problem: redeemProblem("auth.otp_invalid", 2) }, digits: "" },
};

export const CodeExpired: Story = {
  args: { state: { step: "code", challenge, problem: redeemProblem("auth.otp_expired") } },
};

export const TooManyAttempts: Story = {
  args: { state: { step: "code", challenge, problem: redeemProblem("auth.otp_attempts_exceeded") } },
};

export const RateLimited: Story = {
  args: { state: { step: "preview", problem: redeemProblem("auth.otp_rate_limited") } },
};

export const Done: Story = {
  args: {
    state: {
      step: "done",
      accepted: { tenantId: "t", unitId: "u", partyId: "p", refreshRequired: true, acceptedOn: "2026-11-05" },
    },
  },
};

export const NotFound: Story = {
  args: { preview: null, state: { step: "closed", problem: redeemProblem("invitation.not_found") } },
};
export const AlreadyUsed: Story = {
  args: { state: { step: "closed", problem: redeemProblem("invitation.not_pending") } },
};
export const OtherLineAccount: Story = {
  args: { state: { step: "closed", problem: redeemProblem("invitation.party_mismatch") } },
};
export const NoPhoneOnRegister: Story = {
  args: { state: { step: "closed", problem: redeemProblem("invitation.phone_missing") } },
};
