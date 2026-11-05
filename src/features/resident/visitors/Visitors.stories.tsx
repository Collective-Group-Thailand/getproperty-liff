import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";

import commonEn from "@/i18n/messages/en/shared/common.json";
import errorsEn from "@/i18n/messages/en/shared/errors.json";
import statusEn from "@/i18n/messages/en/shared/status.json";
import visitorsEn from "@/i18n/messages/en/resident/visitors.json";
import commonTh from "@/i18n/messages/th/shared/common.json";
import errorsTh from "@/i18n/messages/th/shared/errors.json";
import statusTh from "@/i18n/messages/th/shared/status.json";
import visitorsTh from "@/i18n/messages/th/resident/visitors.json";
import type { OpenableGate, ResidentVisit, VisitInviteCreated } from "@/lib/api/types";

import SosSheet from "../sos/SosSheet";
import { HoldToConfirm } from "../sos/HoldToConfirm";
import { CarsManager } from "./CarsManager";
import { InviteCreated } from "./InviteCreated";
import { InviteForm } from "./InviteForm";
import { OpenBarrier } from "./OpenBarrier";
import { PolicyForm } from "./PolicyForm";
import { VisitAnswer } from "./VisitAnswer";
import { VisitCard, VisitResultCard } from "./VisitParts";

/**
 * JL4 — visitors, gate and SOS at 390 px (the screens are server components, reviewed as screenshots in
 * `_shots/j-JL4`): the visitor card with and without a camera frame, the answers and their results, hold-to-confirm,
 * the barrier, the invite form and the pass, cars and the house policy by role.
 */
const MESSAGES = {
  th: { common: commonTh, errors: errorsTh, status: statusTh, resident: { visitors: visitorsTh } },
  en: { common: commonEn, errors: errorsEn, status: statusEn, resident: { visitors: visitorsEn } },
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
  title: "Resident/Visitors and gate",
  decorators: [withIntl],
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj;

const frame = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#3a4250"/><rect x="190" y="170" width="260" height="120" rx="18" fill="#9aa3b1"/></svg>',
)}`;

const visit: ResidentVisit = {
  id: "v1",
  gateId: "g1",
  gateName: "ป้อม 1",
  unitId: "u1",
  unitNo: "88/12",
  kind: "guest",
  state: "requested",
  entryBasis: null,
  plate: { category: "3กท", number: "8812", province: "กรุงเทพมหานคร" },
  visitorName: "คุณธนา",
  hasPhoto: true,
  respondBy: "2099-11-05T22:44:00+07:00",
  timeoutAction: "guard_calls",
  decidedAt: null,
  decisionReason: null,
  callMeAt: null,
  enteredAt: null,
  exitedAt: null,
  exitedBy: null,
  cancelledAt: null,
  createdAt: "2026-11-05T22:41:00+07:00",
  decidedByName: null,
  policy: {
    action: "guard_calls",
    custom: false,
    deliverySkipApproval: null,
    householdNote: null,
    timeoutSeconds: 180,
  },
  photoUrl: frame,
};
const answer = { me: "สมชาย", rememberDays: 30, minutes: 3, locale: "th" as const };

export const CardWithPhoto: Story = { render: () => <VisitCard visit={visit} locale="th" /> };
export const CardWithoutPhoto: Story = {
  render: () => <VisitCard visit={{ ...visit, photoUrl: null, hasPhoto: false }} locale="th" />,
};
export const CardOnFoot: Story = {
  render: () => <VisitCard visit={{ ...visit, photoUrl: null, plate: null, kind: "delivery" }} locale="th" />,
};
export const Answer: Story = { render: () => <VisitAnswer visit={visit} answer={null} {...answer} /> };
export const AnswerFromLineButton: Story = {
  render: () => <VisitAnswer visit={visit} answer="approve" {...answer} />,
};
export const AnswerGuardAskedToCall: Story = {
  render: () => <VisitAnswer visit={{ ...visit, callMeAt: "2026-11-05T22:42:00+07:00" }} answer={null} {...answer} />,
};
export const ResultSomeoneElse: Story = {
  render: () => (
    <VisitResultCard
      visit={visit}
      result={{ kind: "approved", by: "คุณวิภา", at: "2026-11-05T22:42:00+07:00", someoneElse: true, policy: null }}
      me="สมชาย"
      minutes={3}
      locale="th"
    />
  ),
};
export const ResultTimedOut: Story = {
  render: () => (
    <VisitAnswer
      visit={{ ...visit, state: "timed_out", decidedAt: "2026-11-05T22:44:00+07:00" }}
      answer={null}
      {...answer}
    />
  ),
};
export const ResultEnglish: Story = {
  parameters: { locale: "en" },
  render: () => (
    <VisitAnswer
      visit={{ ...visit, state: "entered", enteredAt: "2026-11-05T22:45:00+07:00", decidedByName: "สมชาย" }}
      answer={null}
      {...answer}
      locale="en"
    />
  ),
};

export const HoldToSend: Story = {
  render: () => (
    <HoldToConfirm
      label="กดค้างไว้เพื่อแจ้งเหตุ"
      holdingLabel="กดค้างไว้… ปล่อยเพื่อยกเลิก"
      tapHint="กดค้างไว้จนวงครบ (1.5 วินาที) เพื่อกันกดพลาด"
      accessibleLabel="แจ้งเหตุ (ยืนยันในกล่องข้อความ)"
      confirm={{
        title: "แจ้งเหตุ?",
        body: "ป้อมทุกประตูจะได้รับทันที",
        confirmLabel: "แจ้งเหตุ",
        cancelLabel: "ยังไม่แจ้ง",
      }}
      onConfirm={() => undefined}
    />
  ),
};
export const Sos: Story = {
  render: () => <SosSheet open onOpenChange={() => undefined} unitId="u1" unitName="บ้าน 88/12" />,
};

const car = (id: string, category: string, number: string, label: string | null) => ({
  id,
  unitId: "u1",
  plate: { category, number, province: "กรุงเทพมหานคร" },
  label,
  createdAt: "2026-10-01T00:00:00+07:00",
});
const gate: OpenableGate = {
  gateId: "g1",
  name: "ป้อม 1",
  kind: "main",
  propertyId: "p1",
  propertyName: "หมู่บ้านลดาวัลย์",
  enabled: true,
  requireGeofence: false,
  vehicles: [car("c1", "8กร", "1288", "รถของฉัน")],
};
export const Barrier: Story = { render: () => <OpenBarrier gates={[gate]} locale="th" /> };
export const BarrierTwoGatesTwoCars: Story = {
  render: () => (
    <OpenBarrier
      gates={[
        { ...gate, vehicles: [...gate.vehicles, car("c2", "ขพ", "407", "รถคุณแม่")] },
        { ...gate, gateId: "g2", name: "ป้อม 2 ประตูหลัง", kind: "side" },
      ]}
      locale="th"
    />
  ),
};
export const BarrierWithLocation: Story = {
  render: () => <OpenBarrier gates={[{ ...gate, requireGeofence: true }]} locale="th" />,
};

export const Invite: Story = {
  render: () => (
    <InviteForm
      unitId="u1"
      unitName="บ้าน 88/12"
      place="หมู่บ้านลดาวัลย์"
      now={Date.parse("2026-11-06T09:00:00+07:00")}
      locale="th"
    />
  ),
};
const created: VisitInviteCreated = {
  id: "i1",
  unitId: "u1",
  unitNo: "88/12",
  usage: "multi",
  visitorKind: "other",
  state: "active",
  validFrom: "2026-11-06T09:00:00+07:00",
  validTo: "2026-11-20T18:00:00+07:00",
  maxUses: 20,
  uses: 0,
  plate: null,
  visitorName: "แม่บ้าน (คุณสมใจ)",
  note: null,
  rejectReason: null,
  createdAt: "2026-11-06T09:00:00+07:00",
  token: "gpv1.Zm9vYmFyYmF6cXV4cXV1eGNvcmdlZ3JhdWx0Z2FycGx5",
};
export const InviteReady: Story = {
  render: () => <InviteCreated invite={created} unitName="บ้าน 88/12" place="หมู่บ้านลดาวัลย์" locale="th" />,
};
export const InviteWaitingForOffice: Story = {
  render: () => (
    <InviteCreated
      invite={{ ...created, visitorKind: "contractor", state: "pending_approval", usage: "single", maxUses: 1 }}
      unitName="บ้าน 88/12"
      place="หมู่บ้านลดาวัลย์"
      locale="th"
    />
  ),
};

const remembered = [
  {
    id: "r1",
    unitId: "u1",
    kind: "visitor" as const,
    plate: { category: "1กข", number: "1234", province: "กรุงเทพมหานคร" },
    label: "รถพี่สาว",
    expiresAt: "2026-11-18T00:00:00+07:00",
  },
];
export const Cars: Story = {
  render: () => (
    <CarsManager
      unitId="u1"
      cars={[car("c1", "8กร", "1288", "รถของฉัน")]}
      remembered={remembered}
      canEdit
      locale="th"
    />
  ),
};
export const CarsFamily: Story = {
  render: () => <CarsManager unitId="u1" cars={[]} remembered={remembered} canEdit={false} locale="th" />,
};

const policy = {
  action: "guard_calls" as const,
  custom: false,
  deliverySkipApproval: null,
  householdNote: null,
  timeoutSeconds: 180,
};
export const Policy: Story = { render: () => <PolicyForm unitId="u1" policy={policy} canEdit /> };
export const PolicyFamily: Story = {
  render: () => (
    <PolicyForm unitId="u1" policy={{ ...policy, householdNote: "กดกริ่งหน้าบ้านได้เลย" }} canEdit={false} />
  ),
};
