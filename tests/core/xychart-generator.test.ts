import { describe, expect, it } from "vitest";
import { generateXYChart } from "../../src/core/xychart/generator";
import { parseXYChart } from "../../src/core/xychart/parser";
import type { XYChartIR } from "../../src/core/xychart/ir-types";

describe("generateXYChart", () => {
  it("emits bare header for empty IR", () => {
    const ir: XYChartIR = { kind: "xychart-beta", orientation: "vertical", items: [] };
    expect(generateXYChart(ir)).toBe("xychart-beta\n");
  });

  it("emits horizontal orientation", () => {
    const ir: XYChartIR = { kind: "xychart-beta", orientation: "horizontal", items: [] };
    expect(generateXYChart(ir).startsWith("xychart-beta horizontal")).toBe(true);
  });

  it("quotes title containing whitespace", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      title: "Monthly Sales",
      items: [],
    };
    expect(generateXYChart(ir)).toContain('title "Monthly Sales"');
  });

  it("emits categorical x-axis", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      xAxis: { kind: "categorical", title: "Months", categories: ["Jan", "Feb"] },
      items: [],
    };
    expect(generateXYChart(ir)).toContain('  x-axis "Months" [Jan, Feb]');
  });

  it("quotes categories containing whitespace", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      xAxis: { kind: "categorical", categories: ["Jan", "Feb 2024"] },
      items: [],
    };
    expect(generateXYChart(ir)).toContain('[Jan, "Feb 2024"]');
  });

  it("emits numeric y-axis", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      yAxis: { kind: "numeric", title: "Revenue", min: 0, max: 100 },
      items: [],
    };
    expect(generateXYChart(ir)).toContain('  y-axis "Revenue" 0 --> 100');
  });

  it("emits series", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      items: [{ type: "series", series: "bar", values: [1, 2, 3] }],
    };
    expect(generateXYChart(ir)).toContain("  bar [1, 2, 3]");
  });

  it("preserves raw lines", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      items: [{ type: "raw", line: "  %% custom" }],
    };
    expect(generateXYChart(ir)).toContain("  %% custom");
  });
});

describe("xychart parse → generate → parse round-trip", () => {
  const src = `xychart-beta horizontal
  title "Monthly Sales"
  x-axis "Months" [Jan, "Feb 2024", Mar]
  y-axis "Revenue" 0 --> 100
  bar [30, 50, 45]
  line [30, 50, 45]
  %% comment
`;

  it("generates parseable output", () => {
    const first = parseXYChart(src);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = parseXYChart(generateXYChart(first.ir));
    expect(second.ok).toBe(true);
  });

  it("preserves orientation, title, axes and series", () => {
    const first = parseXYChart(src);
    if (!first.ok) return;
    const second = parseXYChart(generateXYChart(first.ir));
    if (!second.ok) return;
    expect(second.ir.orientation).toBe(first.ir.orientation);
    expect(second.ir.title).toBe(first.ir.title);
    expect(second.ir.xAxis).toEqual(first.ir.xAxis);
    expect(second.ir.yAxis).toEqual(first.ir.yAxis);
    expect(second.ir.items.length).toBe(first.ir.items.length);
  });
});
