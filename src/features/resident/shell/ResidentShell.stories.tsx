import type { Decorator, Meta, StoryObj } from "@storybook/react-vite";
import { NextIntlClientProvider } from "next-intl";

import commonEn from "@/i18n/messages/en/shared/common.json";
import shellEn from "@/i18n/messages/en/shared/shell.json";
import navEn from "@/i18n/messages/en/resident/nav.json";
import commonTh from "@/i18n/messages/th/shared/common.json";
import shellTh from "@/i18n/messages/th/shared/shell.json";
import navTh from "@/i18n/messages/th/resident/nav.json";
import { Card } from "@/ui/components/Card";
import { Icon, type IconGlyph } from "@/ui/icons";
import { IconBill } from "@/ui/icons/glyphs/bill";
import { IconElectric } from "@/ui/icons/glyphs/electric";
import { IconHome } from "@/ui/icons/glyphs/home";
import { IconResident } from "@/ui/icons/glyphs/resident";

import { ResidentShellView } from "./ResidentShellView";
import { SettingsMenuView } from "./SettingsMenuView";
import UnitSheet from "./UnitSheet";
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
  { unitId: "a", unitNo: "A-201", buildingName: "อาคาร A", tenantName: "หอพักตัวอย่าง", role: "tenant" },
  { unitId: "b", unitNo: "B-105", buildingName: "อาคาร B", tenantName: "แมนชั่นตัวอย่าง", role: "tenant" },
];

/** JRL: a renter who also co-owns a condominium unit and lives with family in a third (role word per row). */
const MIXED: SwitcherUnit[] = [
  UNITS[0]!,
  {
    unitId: "c",
    unitNo: "C-1203",
    buildingName: "อาคาร C",
    tenantName: "นิติบุคคลอาคารชุด ตัวอย่าง คอนโด",
    role: "co_owner",
  },
  { unitId: "d", unitNo: "9/45", buildingName: "หมู่บ้านตัวอย่าง", tenantName: "นิติบุคคลหมู่บ้าน", role: "family" },
];

const NAV: { key: keyof typeof navTh; href: string; icon: IconGlyph }[] = [
  { key: "home", href: "#", icon: IconHome },
  { key: "bills", href: "#bills", icon: IconBill },
  { key: "usage", href: "#usage", icon: IconElectric },
  { key: "me", href: "#me", icon: IconResident },
];

function navItems(locale: "th" | "en") {
  const labels = locale === "th" ? navTh : navEn;
  return NAV.map((item, index) => ({
    href: item.href,
    label: labels[item.key],
    icon: <Icon icon={item.icon} />,
    active: index === 0,
  }));
}

const noop = () => undefined;

function Body() {
  return (
    <div className="flex flex-1 flex-col gap-6 pt-2 pb-8">
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

/** Sign-in, the SMS code, consent, the LINE entry: the full logo above the content, none in the top bar. */
export const Entry: Story = {
  args: { ...SignedOut.args, brand: "hero" },
};

/** The founder's white version in the dark theme (the `logo-*` tokens). */
export const EntryDark: Story = {
  args: Entry.args,
  globals: { theme: "dark" },
};

/** JRL: the switcher's sheet — "all my units (3)", each with its building, operator and my role there. */
export const UnitSheetWithRoles: Story = {
  args: {
    ...SignedIn.args,
    unit: <UnitSwitcherView units={MIXED} currentId="c" onSelect={noop} />,
    children: <UnitSheet open setOpen={noop} units={MIXED} current={MIXED[1]!} onSelect={noop} />,
  },
};
