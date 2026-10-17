import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "@/ui/test/axe";

import UsageChart from "./UsageChart";
import { UsageFigure } from "./UsageFigure";

const labels = {
  chart: "Electricity use, 7 days, compared with the period before. The values are in the table below",
  current: "Last 7 days",
  previous: "The 7 days before",
  showTable: "Show as a table",
  hideTable: "Hide the table",
  period: "Day",
  caption: "Electricity use in kWh",
};
const rows = [
  { label: "1 Nov", current: "6.250", previous: "5.000" },
  { label: "2 Nov", current: null, previous: "7.125" },
];

describe("usage chart (L3 3.3)", () => {
  it("is one image with a description in words; bars are sized from the API's strings", () => {
    const { container } = render(
      <UsageChart rows={rows} label={labels.chart} tone="electric" firstLabel="1 Nov" lastLabel="2 Nov" />,
    );
    expect(screen.getByRole("img", { name: labels.chart })).toBeInTheDocument();
    // two previous bars, one current bar (a missing bucket draws no bar)
    const heights = [...container.querySelectorAll("rect")].map((r) => Number(r.getAttribute("height")));
    expect(heights).toHaveLength(4);
    expect(Math.max(...heights)).toBeCloseTo(136, 0);
    expect(heights).toContain(0);
  });

  it("has a data-table fallback behind a toggle that says whether it is open", async () => {
    await expectNoAxeViolations(
      <UsageFigure
        rows={rows}
        table={[
          { label: "1 Nov", current: "6.25 kWh", previous: "5 kWh" },
          { label: "2 Nov", current: "—", previous: "7.125 kWh" },
        ]}
        tone="electric"
        labels={labels}
        firstLabel="1 Nov"
        lastLabel="2 Nov"
      />,
    );
    const toggle = screen.getByRole("button", { name: "Show as a table" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("table")).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Hide the table" })).toHaveAttribute("aria-expanded", "true");
    const table = screen.getByRole("table", { name: labels.caption });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(screen.getByRole("rowheader", { name: "2 Nov" })).toBeInTheDocument();
  });
});
