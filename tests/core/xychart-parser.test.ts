import { describe, expect, it } from "vitest";
import { parseXYChart } from "../../src/core/xychart/parser";

describe("parseXYChart", () => {
  it("returns ok for minimal header", () => {
    const result = parseXYChart("xychart-beta\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.kind).toBe("xychart-beta");
    expect(result.ir.orientation).toBe("vertical");
  });

  it("detects horizontal orientation", () => {
    const result = parseXYChart("xychart-beta horizontal\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.orientation).toBe("horizontal");
  });

  it("returns error when header is missing", () => {
    expect(parseXYChart("flowchart TD\n").ok).toBe(false);
  });

  it("parses quoted title", () => {
    const result = parseXYChart('xychart-beta\n  title "Monthly Sales"\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.title).toBe("Monthly Sales");
  });

  it("parses bare title", () => {
    const result = parseXYChart("xychart-beta\n  title Sales\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.title).toBe("Sales");
  });

  describe("axes", () => {
    it("parses categorical x-axis with title and unquoted categories", () => {
      const result = parseXYChart('xychart-beta\n  x-axis "Months" [Jan, Feb, Mar]\n');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.xAxis).toEqual({
        kind: "categorical",
        title: "Months",
        categories: ["Jan", "Feb", "Mar"],
      });
    });

    it("parses categorical x-axis with quoted category containing space", () => {
      const result = parseXYChart('xychart-beta\n  x-axis [Jan, "Feb 2024", Mar]\n');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const axis = result.ir.xAxis;
      expect(axis?.kind).toBe("categorical");
      if (axis?.kind !== "categorical") return;
      expect(axis.categories).toEqual(["Jan", "Feb 2024", "Mar"]);
    });

    it("parses numeric range y-axis", () => {
      const result = parseXYChart('xychart-beta\n  y-axis "Revenue" 0 --> 100\n');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.yAxis).toEqual({
        kind: "numeric",
        title: "Revenue",
        min: 0,
        max: 100,
      });
    });

    it("parses label-only y-axis", () => {
      const result = parseXYChart('xychart-beta\n  y-axis "Revenue"\n');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.yAxis).toEqual({ kind: "label-only", title: "Revenue" });
    });
  });

  describe("series", () => {
    it("parses bar series", () => {
      const result = parseXYChart("xychart-beta\n  bar [30, 50, 45]\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const series = result.ir.items.filter((i) => i.type === "series");
      expect(series).toHaveLength(1);
      expect(series[0]).toMatchObject({ series: "bar", values: [30, 50, 45] });
    });

    it("parses line series with decimal and negative values", () => {
      const result = parseXYChart("xychart-beta\n  line [1.3, 0.6, 2.4, -0.34]\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const series = result.ir.items.filter((i) => i.type === "series");
      expect(series[0]).toMatchObject({ series: "line", values: [1.3, 0.6, 2.4, -0.34] });
    });

    it("preserves multiple series in order", () => {
      const src = "xychart-beta\n  bar [1, 2]\n  line [3, 4]\n";
      const result = parseXYChart(src);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.items.map((i) => (i.type === "series" ? i.series : "raw"))).toEqual([
        "bar",
        "line",
      ]);
    });
  });

  it("preserves unknown lines as raw", () => {
    const result = parseXYChart("xychart-beta\n  someUnknownDirective\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.items.filter((i) => i.type === "raw")).toHaveLength(1);
  });
});
