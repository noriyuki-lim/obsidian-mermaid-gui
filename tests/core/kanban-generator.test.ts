import { describe, it, expect } from "vitest";
import { parseKanban } from "../../src/core/kanban/parser";
import { generateKanban } from "../../src/core/kanban/generator";

/** Parse → generate → parse must preserve structure (round-trip). */
const roundTrip = (src: string): string => {
  const out = parseKanban(src);
  if (!out.ok) throw new Error("parse failed: " + out.message);
  return generateKanban(out.ir);
};

describe("generateKanban", () => {
  it("emits the kanban header", () => {
    const out = parseKanban("kanban");
    if (!out.ok) throw new Error("parse failed");
    expect(generateKanban(out.ir)).toBe("kanban");
  });

  it("indents columns at 2 spaces and cards at 4", () => {
    const src = "kanban\n  todo[To Do]\n    t1[Draft]";
    expect(roundTrip(src)).toBe("kanban\n  todo[To Do]\n    t1[Draft]");
  });

  it("round-trips card metadata verbatim", () => {
    const src = "kanban\n  doing[Doing]\n    t1[Build]@{ assigned: 'kn', priority: 'High' }";
    expect(roundTrip(src)).toBe(src);
  });

  it("round-trips bare column titles", () => {
    const src = "kanban\n  Backlog\n    [an idea]";
    expect(roundTrip(src)).toBe(src);
  });

  it("is stable across a second round-trip", () => {
    const src = "kanban\n  a[A]\n    c1[one]\n    c2[two]\n  b[B]\n    c3[three]";
    const once = roundTrip(src);
    const twice = roundTrip(once);
    expect(twice).toBe(once);
  });
});
