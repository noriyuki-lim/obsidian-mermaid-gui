import { describe, expect, it } from "vitest";
import { generateRadar } from "../../src/core/radar/generator";
import { parseRadar } from "../../src/core/radar/parser";
import type { RadarIR } from "../../src/core/radar/ir-types";

const empty: RadarIR = {
  kind: "radar-beta",
  axes: [],
  curves: [],
  options: {},
  rawLines: [],
};

describe("generateRadar", () => {
  it("emits bare header for empty IR", () => {
    expect(generateRadar(empty)).toBe("radar-beta\n");
  });

  it("emits title", () => {
    expect(generateRadar({ ...empty, title: "X" })).toContain("  title X");
  });

  it("emits axis with label", () => {
    const ir: RadarIR = { ...empty, axes: [{ id: "food", label: "Food Quality" }] };
    expect(generateRadar(ir)).toContain('  axis food["Food Quality"]');
  });

  it("emits axis without label", () => {
    const ir: RadarIR = { ...empty, axes: [{ id: "food" }] };
    expect(generateRadar(ir)).toContain("  axis food");
  });

  it("emits curve with label and values", () => {
    const ir: RadarIR = {
      ...empty,
      curves: [{ id: "a", label: "Restaurant A", values: [4, 3, 2, 4] }],
    };
    expect(generateRadar(ir)).toContain('  curve a["Restaurant A"]{4, 3, 2, 4}');
  });

  it("emits options", () => {
    const ir: RadarIR = {
      ...empty,
      options: { showLegend: true, max: 5, min: 0, ticks: 4, graticule: "polygon" },
    };
    const out = generateRadar(ir);
    expect(out).toContain("  showLegend true");
    expect(out).toContain("  max 5");
    expect(out).toContain("  min 0");
    expect(out).toContain("  ticks 4");
    expect(out).toContain("  graticule polygon");
  });

  it("appends raw lines", () => {
    const ir: RadarIR = {
      ...empty,
      rawLines: [{ type: "raw", line: "  curve a{axis1: 10}" }],
    };
    expect(generateRadar(ir)).toContain("  curve a{axis1: 10}");
  });
});

describe("radar parse → generate → parse round-trip", () => {
  const src = `radar-beta
  title Restaurant Comparison
  axis food["Food Quality"], service["Service"], price["Price"]
  axis ambiance["Ambiance"]
  curve a["Restaurant A"]{4, 3, 2, 4}
  curve b["Restaurant B"]{3, 4, 3, 3}
  graticule polygon
  max 5
  curve x{axis1: 10}
`;

  it("generates parseable output", () => {
    const first = parseRadar(src);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = parseRadar(generateRadar(first.ir));
    expect(second.ok).toBe(true);
  });

  it("preserves title, axes, curves, options and raw lines", () => {
    const first = parseRadar(src);
    if (!first.ok) return;
    const second = parseRadar(generateRadar(first.ir));
    if (!second.ok) return;
    expect(second.ir.title).toBe(first.ir.title);
    expect(second.ir.axes).toEqual(first.ir.axes);
    expect(second.ir.curves).toEqual(first.ir.curves);
    expect(second.ir.options).toEqual(first.ir.options);
    expect(second.ir.rawLines.length).toBe(first.ir.rawLines.length);
  });
});
