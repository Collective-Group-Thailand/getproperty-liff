import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { NextIntlClientProvider } from "next-intl";

import commonEn from "@/i18n/messages/en/shared/common.json";
import shellEn from "@/i18n/messages/en/shared/shell.json";
import navEn from "@/i18n/messages/en/resident/nav.json";
import commonTh from "@/i18n/messages/th/shared/common.json";
import shellTh from "@/i18n/messages/th/shared/shell.json";
import navTh from "@/i18n/messages/th/resident/nav.json";
import { Card } from "@/ui/components/Card";
import { Icon, type IconName } from "@/ui/icons";

import { ResidentShellView } from "./ResidentShellView";
import { SettingsMenuView } from "./SettingsMenuView";
import { UnitSwitcherView, type SwitcherUnit } from "./UnitSwitcherView";

/**
 * The resident shell (L1 1.3): what `ResidentShell` renders from `/v1/resident/me`, with fixed data. These
 * stories are the shell's visual snapshots (`pnpm test:visual`, `e2e-visual/`).
 */
const MESSAGES = {
  th: { shell: shellTh, common: commonTh, resident: { nav: navTh } },
  en: { shell: shellEn, common: commonEn, resident: { nav: navEn } },
};

const withIntl: Decorator = (Story, context) => {
  const locale = (context.parameters.locale as "th" | "en" | undefined) ?? "th";
  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Asia/Bangkok">
      <div className="-m-6">
        <Story />
      </div>
    </NextIntlClientProvider>
  );
};

const UNITS: SwitcherUnit[] = [
  { unitId: "a", unitNo: "A-201", buildingName: "อาคาร A", tenantName: "หอพักตัวอย่าง" },
  { unitId: "b", unitNo: "B-105", buildingName: "อาคาร B", tenantName: "แมนชั่นตัวอย่าง" },
];

const NAV: { key: keyof typeof navTh; href: string; icon: IconName }[] = [
  { key: "home", href: "#", icon: "home" },
  { key: "bills", href: "#bills", icon: "bill" },
  { key: "usage", href: "#usage", icon: "electric" },
  { key: "me", href: "#me", icon: "resident" },
];

function navItems(locale: "th" | "en") {
  const labels = locale === "th" ? navTh : navEn;
  return NAV.map((item, index) => ({
    href: item.href,
    label: labels[item.key],
    icon: <Icon name={item.icon} />,
    active: index === 0,
  }));
}

const noop = () => undefined;

function Body() {
  return (
    <div className="flex flex-col gap-4 py-5">
      <h1 className="font-display text-2xl font-semibold">สวัสดี สมชาย ใจดี</h1>
      <Card padding="md">
        <p className="text-muted text-sm">ห้องของคุณ</p>
        <p className="mt-1 text-lg font-semibold">ห้อง A-201</p>
      </Card>
    </div>
  );
}

const meta = {
  title: "Patterns/Resident shell",
  component: ResidentShellView,
  decorators: [withIntl],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ResidentShellView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {
  args: {
    skipLabel: shellTh.skipToContent,
    navLabel: shellTh.bottomNav,
    navItems: navItems("th"),
    unit: <UnitSwitcherView units={UNITS.slice(0, 1)} currentId="a" onSelect={noop} />,
    settings: <SettingsMenuView locale="th" signedIn onLanguage={noop} onSignOut={noop} />,
    children: <Body />,
  },
};

export const SeveralUnits: Story = {
  args: { ...SignedIn.args, unit: <UnitSwitcherView units={UNITS} currentId="b" onSelect={noop} /> },
};

export const SignedOut: Story = {
  args: {
    ...SignedIn.args,
    navItems: [],
    unit: undefined,
    settings: <SettingsMenuView locale="th" signedIn={false} onLanguage={noop} onSignOut={noop} />,
  },
};

export const English: Story = {
  parameters: { locale: "en" },
  args: {
    ...SignedIn.args,
    skipLabel: shellEn.skipToContent,
    navLabel: shellEn.bottomNav,
    navItems: navItems("en"),
    unit: <UnitSwitcherView units={UNITS} currentId="a" onSelect={noop} />,
    settings: <SettingsMenuView locale="en" signedIn onLanguage={noop} onSignOut={noop} />,
  },
};

export const WithEnvironmentBadge: Story = {
  args: { ...SignedIn.args, envBadge: "สภาพแวดล้อม uat" },
};
