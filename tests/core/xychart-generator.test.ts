import { describe, expect, it } from "vitest";
import { generateXYChart } from "../../src/core/xychart/generator";
import { parseXYChart } from "../../src/core/xychart/parser";
import type { XYChartIR } from "../../src/core/xychart/ir-types";

describe("generateXYChart", () => {
  it("emits bare header for empty IR", () => {
    const ir: XYChartIR = { kind: "xychart-beta", orientation: "vertical", items: [], leadingRawLines: [] };
    expect(generateXYChart(ir)).toBe("xychart-beta\n");
  });

  it("emits horizontal orientation", () => {
    const ir: XYChartIR = { kind: "xychart-beta", orientation: "horizontal", items: [], leadingRawLines: [] };
    expect(generateXYChart(ir).startsWith("xychart-beta horizontal")).toBe(true);
  });

  it("quotes title containing whitespace", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      title: "Monthly Sales",
      items: [],
      leadingRawLines: [],
    };
    expect(generateXYChart(ir)).toContain('title "Monthly Sales"');
  });

  it("emits categorical x-axis", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      xAxis: { kind: "categorical", title: "Months", categories: ["Jan", "Feb"] },
      items: [],
      leadingRawLines: [],
    };
    expect(generateXYChart(ir)).toContain('  x-axis "Months" [Jan, Feb]');
  });

  it("quotes categories containing whitespace", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      xAxis: { kind: "categorical", categories: ["Jan", "Feb 2024"] },
      items: [],
      leadingRawLines: [],
    };
    expect(generateXYChart(ir)).toContain('[Jan, "Feb 2024"]');
  });

  it("emits numeric y-axis", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      yAxis: { kind: "numeric", title: "Revenue", min: 0, max: 100 },
      items: [],
      leadingRawLines: [],
    };
    expect(generateXYChart(ir)).toContain('  y-axis "Revenue" 0 --> 100');
  });

  it("emits series", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      items: [{ type: "series", series: "bar", values: [1, 2, 3] }],
      leadingRawLines: [],
    };
    expect(generateXYChart(ir)).toContain("  bar [1, 2, 3]");
  });

  it("preserves raw lines", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      items: [{ type: "raw", line: "  %% custom" }],
      leadingRawLines: [],
    };
    expect(generateXYChart(ir)).toContain("  %% custom");
  });

  it("emits leadingRawLines before the header", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      items: [],
      leadingRawLines: ["%% kept comment"],
    };
    expect(generateXYChart(ir)).toBe("%% kept comment\nxychart-beta\n");
  });

  it("emits a series title as a trailing %% gui:seriesTitle comment", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      items: [{ type: "series", series: "bar", values: [1, 2, 3], title: "Revenue" }],
      leadingRawLines: [],
    };
    expect(generateXYChart(ir)).toContain("  bar [1, 2, 3] %% gui:seriesTitle Revenue");
  });

  it("omits the title comment when no title is set", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      items: [{ type: "series", series: "bar", values: [1, 2, 3] }],
      leadingRawLines: [],
    };
    expect(generateXYChart(ir)).not.toContain("gui:seriesTitle");
  });

  it("emits plotColorPalette as a leading %%{init}%% directive", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      items: [],
      leadingRawLines: [],
      plotColorPalette: ["#000000", "#0000FF", "#00FF00"],
    };
    expect(generateXYChart(ir)).toContain(
      '%%{init: {"themeVariables": {"xyChart": {"plotColorPalette": "#000000, #0000FF, #00FF00"}}}}%%',
    );
  });

  it("omits the palette directive when plotColorPalette is unset or empty", () => {
    const ir: XYChartIR = {
      kind: "xychart-beta",
      orientation: "vertical",
      items: [],
      leadingRawLines: [],
    };
    expect(generateXYChart(ir)).not.toContain("plotColorPalette");
    expect(generateXYChart({ ...ir, plotColorPalette: [] })).not.toContain("plotColorPalette");
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

  it("keeps orientation horizontal when the source used a %%{init}%% directive instead of the inline keyword", () => {
    const initSrc = '%%{init: {"xyChart": {"chartOrientation": "horizontal"}}}%%\nxychart-beta\n  bar [1, 2, 3]\n';
    const first = parseXYChart(initSrc);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.ir.orientation).toBe("horizontal");

    const regenerated = generateXYChart(first.ir);
    const second = parseXYChart(regenerated);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.ir.orientation).toBe("horizontal");
  });

  it("keeps a renamed series title across a save + reopen (parse → generate → parse)", () => {
    const first = parseXYChart(src);
    if (!first.ok) return;
    const renamed = {
      ...first.ir,
      items: first.ir.items.map(item =>
        item.type === "series" && item.series === "bar" ? { ...item, title: "Revenue" } : item,
      ),
    };
    const second = parseXYChart(generateXYChart(renamed));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const barSeries = second.ir.items.find(i => i.type === "series" && i.series === "bar");
    expect((barSeries as { title?: string } | undefined)?.title).toBe("Revenue");
  });

  it("keeps a custom plotColorPalette across a save + reopen (parse → generate → parse)", () => {
    const first = parseXYChart(src);
    if (!first.ok) return;
    const recolored = { ...first.ir, plotColorPalette: ["#111111", "#222222"] };
    const second = parseXYChart(generateXYChart(recolored));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.ir.plotColorPalette).toEqual(["#111111", "#222222"]);
  });
});
