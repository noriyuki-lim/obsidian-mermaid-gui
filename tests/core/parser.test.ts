import { describe, expect, it } from "vitest";
import { parseMermaid } from "../../src/core/parser";
import { generateMermaid } from "../../src/core/generator";

describe("parser", () => {
  it("parses a minimal flowchart", () => {
    const r = parseMermaid("flowchart TD\n  A --> B\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.direction).toBe("TD");
    expect(r.ir.nodes).toHaveLength(2);
    expect(r.ir.edges).toHaveLength(1);
    expect(r.ir.edges[0]).toMatchObject({
      source: "A",
      target: "B",
      style: "solid",
      head: "arrow",
    });
  });

  it("recognises every shape bracket", () => {
    const src = `flowchart LR
  a[Rect]
  b(Round)
  c([Stadium])
  d[[Sub]]
  e[(Cyl)]
  f((Circle))
  g{Rhombus}
  h{{Hex}}
  i>Asym]
  j[/Para/]
  k[/Trap\\]
`;
    const r = parseMermaid(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const shapes = r.ir.nodes.map((n) => n.shape);
    expect(shapes).toEqual([
      "rect",
      "round",
      "stadium",
      "subroutine",
      "cylinder",
      "circle",
      "rhombus",
      "hexagon",
      "asymmetric",
      "parallelogram",
      "trapezoid",
    ]);
  });

  it("parses chained edges and inline labels", () => {
    const r = parseMermaid("flowchart LR\n  A -- hello --> B --> C\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.edges).toHaveLength(2);
    expect(r.ir.edges[0].label).toBe("hello");
    expect(r.ir.edges[1].label).toBeUndefined();
  });

  it("parses pipe-delimited edge labels", () => {
    const r = parseMermaid("flowchart TD\n  A -->|yes| B\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.edges[0].label).toBe("yes");
  });

  it("parses dotted and thick edges", () => {
    const r = parseMermaid("flowchart TD\n  A -.-> B\n  B ==> C\n  C === D\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.edges[0]).toMatchObject({ style: "dotted", head: "arrow" });
    expect(r.ir.edges[1]).toMatchObject({ style: "thick", head: "arrow" });
    expect(r.ir.edges[2]).toMatchObject({ style: "thick", head: "none" });
  });

  it("captures subgraphs", () => {
    const src = `flowchart TD
  subgraph S1 [Title]
    A --> B
  end
  B --> C
`;
    const r = parseMermaid(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.subgraphs).toHaveLength(1);
    expect(r.ir.subgraphs[0]).toMatchObject({ id: "S1", label: "Title" });
    expect(r.ir.nodes.find((n) => n.id === "A")?.subgraph).toBe("S1");
    expect(r.ir.nodes.find((n) => n.id === "C")?.subgraph).toBeNull();
  });

  it("parses direction declarations inside subgraphs", () => {
    const src = `flowchart TD
  subgraph S1 [Title]
    direction LR
    A --> B
  end
`;
    const r = parseMermaid(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.subgraphs[0]).toMatchObject({ id: "S1", direction: "LR" });
  });

  it("preserves unknown lines verbatim", () => {
    const src = `flowchart TD
  A --> B
  classDef big fill:#f00
`;
    const r = parseMermaid(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.rawLines.some((l) => l.includes("classDef"))).toBe(true);
  });

  it("rejects missing header", () => {
    const r = parseMermaid("A --> B\n");
    expect(r.ok).toBe(false);
  });

  it("parses dotted edge with label", () => {
    const r = parseMermaid("flowchart TD\n  A -. yes .-> B\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.edges).toHaveLength(1);
    expect(r.ir.edges[0]).toMatchObject({
      style: "dotted",
      head: "arrow",
      label: "yes",
    });
  });

  it("preserves comment lines through round-trip", () => {
    const src = `flowchart TD
  %% note about the flow
  A --> B
`;
    const r = parseMermaid(src);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.ir.rawLines.some((l) => l.includes("%% note"))).toBe(true);
    const out = generateMermaid(r.ir);
    expect(out).toContain("%% note");
  });

  it("lets later definitions override shape and label", () => {
    const r = parseMermaid("flowchart TD\n  A[Apple]\n  A(Banana)\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = r.ir.nodes.find((n) => n.id === "A");
    expect(a).toBeTruthy();
    expect(a?.shape).toBe("round");
    expect(a?.label).toBe("Banana");
  });

  it("parses numeric IDs", () => {
    const r = parseMermaid("flowchart TD\n  0[Zero]\n  0 --> 1\n");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ids = r.ir.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(["0", "1"]);
    expect(r.ir.nodes.find((n) => n.id === "0")?.label).toBe("Zero");
    expect(r.ir.edges).toHaveLength(1);
    expect(r.ir.edges[0]).toMatchObject({ source: "0", target: "1" });
  });

  it("quotes ampersand in labels when generating", () => {
    const r = parseMermaid('flowchart TD\n  A["Foo & Bar"]\n');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = generateMermaid(r.ir);
    expect(out).toContain('"Foo & Bar"');
  });
});

describe("generator round-trip", () => {
  it("preserves graph semantics through parse → generate → parse", () => {
    const src = `flowchart TD
  A[Apple] --> B(Banana)
  B -- yes --> C{Cherry}
  C -.-> D
  subgraph S1 [Group]
    D --> E
  end
`;
    const r1 = parseMermaid(src);
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    const out = generateMermaid(r1.ir);
    const r2 = parseMermaid(out);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.ir.nodes.map((n) => n.id).sort()).toEqual(["A", "B", "C", "D", "E"]);
    expect(r2.ir.edges).toHaveLength(4);
    expect(r2.ir.subgraphs).toHaveLength(1);
    const ny = r2.ir.edges.find((e) => e.label === "yes");
    expect(ny).toBeTruthy();
  });
});
