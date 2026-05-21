import { describe, it, expect } from "vitest";
import { parseMindmap } from "../../src/core/mindmap/parser";

describe("parseMindmap", () => {
  it("parses single root node", () => {
    const src = `mindmap
  Root`;
    const out = parseMindmap(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.root?.text).toBe("Root");
    expect(out.ir.root?.shape).toBe("default");
  });

  it("parses circle shape", () => {
    const src = `mindmap
  ((Root))`;
    const out = parseMindmap(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.root?.shape).toBe("circle");
    expect(out.ir.root?.text).toBe("Root");
  });

  it("parses children with hierarchy", () => {
    const src = `mindmap
  root((mindmap))
    Branch A
      Leaf 1
      Leaf 2
    Branch B`;
    const out = parseMindmap(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.root?.children).toHaveLength(2);
    expect(out.ir.root?.children[0].text).toBe("Branch A");
    expect(out.ir.root?.children[0].children).toHaveLength(2);
    expect(out.ir.root?.children[1].text).toBe("Branch B");
  });

  it("parses ::icon() annotation", () => {
    const src = `mindmap
  root
    A
      ::icon(fa fa-book)`;
    const out = parseMindmap(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.ir.root?.children[0].icon).toBe("fa fa-book");
  });

  it("returns failure for missing header", () => {
    const out = parseMindmap("  root\n    child");
    expect(out.ok).toBe(false);
  });

  it("parses all shapes", () => {
    const cases: Array<[string, string]> = [
      ["[Square]", "square"],
      ["(Rounded)", "rounded"],
      ["((Circle))", "circle"],
      ["{{Hexagon}}", "hexagon"],
      [")Cloud(", "cloud"],
      ["))Bang((", "bang"],
    ];
    for (const [input, expectedShape] of cases) {
      const src = `mindmap\n  ${input}`;
      const out = parseMindmap(src);
      expect(out.ok).toBe(true);
      if (!out.ok) continue;
      expect(out.ir.root?.shape).toBe(expectedShape);
    }
  });
});
