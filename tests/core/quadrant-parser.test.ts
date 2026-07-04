import { describe, expect, it } from "vitest";
import { parseQuadrant } from "../../src/core/quadrant/parser";

describe("parseQuadrant", () => {
  it("returns ok for minimal header", () => {
    const result = parseQuadrant("quadrantChart\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.kind).toBe("quadrantChart");
  });

  it("returns error when header is missing", () => {
    expect(parseQuadrant("flowchart TD\n").ok).toBe(false);
  });

  it("parses title", () => {
    const result = parseQuadrant("quadrantChart\n  title Priority Matrix\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.title).toBe("Priority Matrix");
  });

  it("parses x-axis with arrow form", () => {
    const result = parseQuadrant("quadrantChart\n  x-axis Low Reach --> High Reach\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.xAxis).toEqual({ left: "Low Reach", right: "High Reach" });
  });

  it("parses x-axis without arrow", () => {
    const result = parseQuadrant("quadrantChart\n  x-axis Low\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.xAxis).toEqual({ left: "Low" });
  });

  it("parses y-axis with arrow form", () => {
    const result = parseQuadrant("quadrantChart\n  y-axis Low --> High\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.yAxis).toEqual({ bottom: "Low", top: "High" });
  });

  it("parses quadrant-1..4 labels", () => {
    const src =
      "quadrantChart\n  quadrant-1 A\n  quadrant-2 B\n  quadrant-3 C\n  quadrant-4 D\n";
    const result = parseQuadrant(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.quadrants).toEqual({ q1: "A", q2: "B", q3: "C", q4: "D" });
  });

  it("parses points", () => {
    const result = parseQuadrant("quadrantChart\n  Task A: [0.8, 0.7]\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const pts = result.ir.items.filter((i) => i.type === "point");
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ type: "point", name: "Task A", x: 0.8, y: 0.7 });
  });

  it("preserves styling and class-bound points as raw", () => {
    const src =
      "quadrantChart\n  Task A: [0.5, 0.5] radius: 12\n  Task B:::cls: [0.3, 0.3]\n  classDef cls color: #109060\n";
    const result = parseQuadrant(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raws = result.ir.items.filter((i) => i.type === "raw");
    expect(raws).toHaveLength(3);
  });

  it("preserves %% comments after header as raw items", () => {
    const result = parseQuadrant("quadrantChart\n  %% note\n");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.items.filter((i) => i.type === "raw")).toHaveLength(1);
  });

  it("strips surrounding quotes from title, axis, quadrant and point labels", () => {
    const src = `quadrantChart
  title "My Title"
  x-axis "Low Reach" --> "High Reach"
  y-axis "Low Engagement" --> "High Engagement"
  quadrant-1 "We should expand"
  "Campaign A": [0.3, 0.6]
`;
    const result = parseQuadrant(src);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ir.title).toBe("My Title");
    expect(result.ir.xAxis).toEqual({ left: "Low Reach", right: "High Reach" });
    expect(result.ir.yAxis).toEqual({ bottom: "Low Engagement", top: "High Engagement" });
    expect(result.ir.quadrants.q1).toBe("We should expand");
    const pts = result.ir.items.filter((i) => i.type === "point");
    expect(pts[0]).toMatchObject({ name: "Campaign A" });
  });
});
