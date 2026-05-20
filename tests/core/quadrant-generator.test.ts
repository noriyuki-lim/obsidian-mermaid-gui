import { describe, expect, it } from "vitest";
import { generateQuadrant } from "../../src/core/quadrant/generator";
import { parseQuadrant } from "../../src/core/quadrant/parser";
import type { QuadrantIR } from "../../src/core/quadrant/ir-types";

describe("generateQuadrant", () => {
  it("emits bare header for empty IR", () => {
    const ir: QuadrantIR = { kind: "quadrantChart", quadrants: {}, items: [] };
    expect(generateQuadrant(ir)).toBe("quadrantChart\n");
  });

  it("emits title", () => {
    const ir: QuadrantIR = {
      kind: "quadrantChart",
      title: "X",
      quadrants: {},
      items: [],
    };
    expect(generateQuadrant(ir)).toContain("  title X");
  });

  it("emits x-axis with arrow form", () => {
    const ir: QuadrantIR = {
      kind: "quadrantChart",
      xAxis: { left: "L", right: "R" },
      quadrants: {},
      items: [],
    };
    expect(generateQuadrant(ir)).toContain("  x-axis L --> R");
  });

  it("emits x-axis without arrow", () => {
    const ir: QuadrantIR = {
      kind: "quadrantChart",
      xAxis: { left: "L" },
      quadrants: {},
      items: [],
    };
    const out = generateQuadrant(ir);
    expect(out).toContain("  x-axis L");
    expect(out).not.toContain("-->");
  });

  it("emits quadrant labels in order 1..4", () => {
    const ir: QuadrantIR = {
      kind: "quadrantChart",
      quadrants: { q1: "A", q2: "B", q3: "C", q4: "D" },
      items: [],
    };
    const out = generateQuadrant(ir);
    expect(out).toContain("  quadrant-1 A");
    expect(out).toContain("  quadrant-4 D");
    const i1 = out.indexOf("quadrant-1");
    const i4 = out.indexOf("quadrant-4");
    expect(i1).toBeLessThan(i4);
  });

  it("emits points", () => {
    const ir: QuadrantIR = {
      kind: "quadrantChart",
      quadrants: {},
      items: [{ type: "point", name: "P", x: 0.5, y: 0.7 }],
    };
    expect(generateQuadrant(ir)).toContain("  P: [0.5, 0.7]");
  });

  it("preserves raw lines verbatim", () => {
    const ir: QuadrantIR = {
      kind: "quadrantChart",
      quadrants: {},
      items: [{ type: "raw", line: "  classDef cls color: #fff" }],
    };
    expect(generateQuadrant(ir)).toContain("  classDef cls color: #fff");
  });
});

describe("quadrant parse → generate → parse round-trip", () => {
  const src = `quadrantChart
  title Reach and engagement
  x-axis Low --> High
  y-axis Low --> High
  quadrant-1 Expand
  quadrant-2 Promote
  quadrant-3 Re-evaluate
  quadrant-4 Improve
  Campaign A: [0.3, 0.6]
  Campaign B: [0.45, 0.23]
  Task X:::cls: [0.5, 0.5]
  classDef cls color: #109060
`;

  it("generates parseable output", () => {
    const first = parseQuadrant(src);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = parseQuadrant(generateQuadrant(first.ir));
    expect(second.ok).toBe(true);
  });

  it("preserves title, axes, quadrants, points and raw lines", () => {
    const first = parseQuadrant(src);
    if (!first.ok) return;
    const second = parseQuadrant(generateQuadrant(first.ir));
    if (!second.ok) return;
    expect(second.ir.title).toBe(first.ir.title);
    expect(second.ir.xAxis).toEqual(first.ir.xAxis);
    expect(second.ir.yAxis).toEqual(first.ir.yAxis);
    expect(second.ir.quadrants).toEqual(first.ir.quadrants);
    expect(second.ir.items.map((i) => i.type)).toEqual(first.ir.items.map((i) => i.type));
  });
});
