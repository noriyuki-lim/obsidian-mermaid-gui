import { describe, it, expect } from "vitest";
import { parseMindmap } from "../../src/core/mindmap/parser";
import { generateMindmap } from "../../src/core/mindmap/generator";

describe("generateMindmap — round-trip", () => {
  const roundTrip = (src: string) => {
    const out = parseMindmap(src);
    if (!out.ok) throw new Error(out.message);
    const gen = generateMindmap(out.ir);
    const out2 = parseMindmap(gen);
    if (!out2.ok) throw new Error(`re-parse failed: ${out2.message}\n---\n${gen}`);
    return { first: out.ir, second: out2.ir };
  };

  it("simple tree round-trips", () => {
    const src = `mindmap
  root((Root))
    Branch A
      Leaf 1
    Branch B`;
    const { first, second } = roundTrip(src);
    expect(second.root?.text).toBe(first.root?.text);
    expect(second.root?.shape).toBe(first.root?.shape);
    expect(second.root?.children).toHaveLength(first.root?.children.length ?? 0);
  });

  it("generated source starts with mindmap", () => {
    const src = `mindmap\n  Root\n    Child`;
    const out = parseMindmap(src);
    if (!out.ok) throw new Error(out.message);
    expect(generateMindmap(out.ir)).toMatch(/^mindmap/);
  });

  it("shapes are preserved through round-trip", () => {
    const src = `mindmap
  ((Root))
    [Square]
    (Rounded)
    {{Hexagon}}`;
    const { first, second } = roundTrip(src);
    expect(second.root?.shape).toBe("circle");
    expect(second.root?.children[0].shape).toBe("square");
    expect(second.root?.children[1].shape).toBe("rounded");
    expect(second.root?.children[2].shape).toBe("hexagon");
  });

  it("icon is preserved", () => {
    const src = `mindmap
  root
    A
      ::icon(fa fa-book)`;
    const { first, second } = roundTrip(src);
    expect(second.root?.children[0].icon).toBe(first.root?.children[0].icon);
  });
});
