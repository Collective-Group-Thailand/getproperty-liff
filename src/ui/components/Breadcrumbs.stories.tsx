// copied from getproperty-web@f57d4dc until collective-shared exists (D-155)
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Breadcrumbs } from "./Breadcrumbs";

const meta: Meta<typeof Breadcrumbs> = {
  title: "Patterns/Breadcrumbs",
  component: Breadcrumbs,
  args: {
    label: "เส้นทาง",
    items: [{ label: "อาคาร", href: "#buildings" }, { label: "อาคาร A", href: "#building-a" }, { label: "ห้อง A-201" }],
  },
};
export default meta;
type Story = StoryObj<typeof Breadcrumbs>;

export const Default: Story = {};
export const Single: Story = { args: { items: [{ label: "เช้านี้" }] } };
