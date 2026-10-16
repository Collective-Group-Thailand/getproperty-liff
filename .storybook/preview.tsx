// copied from getproperty-web@08ff63b until collective-shared exists (D-155) — adapted: single resident zone, no tooltip provider
import type { Decorator, Preview } from "@storybook/react-vite";

import { ThemeProvider } from "../src/ui/theme/ThemeProvider";
import type { THEMES } from "../src/ui/theme/themes";

import "./preview.css";

/**
 * Stamps `data-theme` and `data-zone="resident"` the way the root layout does, so every story can be
 * viewed in all three themes at the resident density from the toolbar.
 */
const withTheme: Decorator = (Story, context) => {
  const theme = context.globals.theme as (typeof THEMES)[number] | "";
  const root = document.documentElement;

  if (theme) root.dataset.theme = theme;
  else delete root.dataset.theme;
  root.dataset.zone = "resident";

  return (
    <ThemeProvider initialChoice={theme || "system"} zone="resident">
      <div className="bg-bg text-fg min-h-full p-6">
        <Story />
      </div>
    </ThemeProvider>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  initialGlobals: { theme: "light", viewport: { value: "mobile1", isRotated: false } },
  globalTypes: {
    theme: {
      description: "Token theme",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
          { value: "hc", title: "High contrast" },
          { value: "", title: "Follow the OS" },
        ],
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: "fullscreen",
    controls: { expanded: true },
    // Advisory here; the gate that fails CI is in Vitest and Playwright.
    a11y: { test: "todo" },
    docs: { toc: true },
    options: {
      storySort: {
        order: [
          "Docs",
          ["Principles", "Tokens", "Voice & tone"],
          "Brand",
          "Foundations",
          "Forms",
          "Overlays",
          "Navigation",
          "Data",
          "Feedback",
          "Patterns",
        ],
      },
    },
  },
};

export default preview;
