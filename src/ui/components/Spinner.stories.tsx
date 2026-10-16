// copied from getproperty-web@08ff63b until collective-shared exists (D-155)
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Spinner } from "./Spinner";

const meta: Meta<typeof Spinner> = { title: "Feedback/Spinner", component: Spinner, args: { label: "กำลังโหลด…" } };
export default meta;
type Story = StoryObj<typeof Spinner>;

export const Default: Story = {};
export const Large: Story = { args: { size: "lg" } };
