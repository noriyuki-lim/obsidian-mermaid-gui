import { describe, expect, it } from "vitest";
import { parseRadar } from "../../src/core/radar/parser";

describe("parseRadar", () => {
  it("returns ok for minimal header", () => {
    const result = parseRadar("radar-beta\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.kind).toBe("radar-beta");
  });

  it("returns error when header is missing", () => {
    expect(parseRadar("flowchart TD\n").ok).toBe(false);
  });

  it("parses title", () => {
    const result = parseRadar("radar-beta\n  title Restaurant Comparison\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.title).toBe("Restaurant Comparison");
  });

  describe("axes", () => {
    it("parses single axis without label", () => {
      const result = parseRadar("radar-beta\n  axis food\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.axes).toEqual([{ id: "food" }]);
    });

    it("parses axis with quoted label", () => {
      const result = parseRadar('radar-beta\n  axis food["Food Quality"]\n');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.axes).toEqual([{ id: "food", label: "Food Quality" }]);
    });

    it("parses multiple axes on one line", () => {
      const result = parseRadar(
        'radar-beta\n  axis food["Food Quality"], service["Service"], price["Price"]\n',
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.axes).toHaveLength(3);
      expect(result.ir.axes[2]).toEqual({ id: "price", label: "Price" });
    });

    it("parses bare comma-separated axes", () => {
      const result = parseRadar("radar-beta\n  axis a, b, c\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.axes.map((a) => a.id)).toEqual(["a", "b", "c"]);
    });
  });

  describe("curves", () => {
    it("parses curve with label and numeric list", () => {
      const result = parseRadar('radar-beta\n  curve a["Restaurant A"]{4, 3, 2, 4}\n');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.curves).toEqual([
        { id: "a", label: "Restaurant A", values: [4, 3, 2, 4] },
      ]);
    });

    it("parses curve without label", () => {
      const result = parseRadar("radar-beta\n  curve a{1, 2, 3}\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.curves[0]).toEqual({ id: "a", values: [1, 2, 3] });
    });

    it("preserves key:value curve form as raw", () => {
      const result = parseRadar("radar-beta\n  curve a{axis1: 10, axis2: 20}\n");
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.curves).toHaveLength(0);
      expect(result.ir.rawLines).toHaveLength(1);
    });
  });

  describe("options", () => {
    it("parses showLegend true/false", () => {
      const a = parseRadar("radar-beta\n  showLegend true\n");
      const b = parseRadar("radar-beta\n  showLegend false\n");
      expect(a.ok && b.ok).toBe(true);
      if (!a.ok || !b.ok) return;
      expect(a.ir.options.showLegend).toBe(true);
      expect(b.ir.options.showLegend).toBe(false);
    });

    it("parses max, min, ticks, graticule", () => {
      const result = parseRadar(
        "radar-beta\n  max 5\n  min 0\n  ticks 4\n  graticule polygon\n",
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.ir.options).toMatchObject({
        max: 5,
        min: 0,
        ticks: 4,
        graticule: "polygon",
      });
    });
  });
});
