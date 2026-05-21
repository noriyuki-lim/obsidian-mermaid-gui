import { describe, it, expect } from "vitest";
import { parseMermaid } from "../../src/core/parser";
import { generateMermaid } from "../../src/core/generator";

describe("flowchart — style directives (color round-trip)", () => {
  it("parses `style A fill:#ff9999,stroke:#003366` into IRNode color fields", () => {
    const src = `flowchart TD
  A[Apple]
  A --> B
  style A fill:#ff9999,stroke:#003366
`;
    const out = parseMermaid(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const a = out.ir.nodes.find((n) => n.id === "A");
    expect(a?.color).toBe("#ff9999");
    expect(a?.borderColor).toBe("#003366");
  });

  it("parses `style SG1 fill:#eef` into IRSubgraph color", () => {
    const src = `flowchart TD
  subgraph SG1 [Group]
    B
  end
  style SG1 fill:#eef,stroke:#88f
`;
    const out = parseMermaid(src);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const sg = out.ir.subgraphs.find((s) => s.id === "SG1");
    expect(sg?.color).toBe("#eef");
    expect(sg?.borderColor).toBe("#88f");
  });

  it("round-trips node colors via parse → generate → parse", () => {
    const src = `flowchart TD
  A[Apple]
  A --> B
  style A fill:#ff9999,stroke:#003366
`;
    const out = parseMermaid(src);
    if (!out.ok) throw new Error(out.message);
    const generated = generateMermaid(out.ir);
    const out2 = parseMermaid(generated);
    if (!out2.ok) throw new Error(`re-parse: ${out2.message}\n---\n${generated}`);
    const a = out2.ir.nodes.find((n) => n.id === "A");
    expect(a?.color).toBe("#ff9999");
    expect(a?.borderColor).toBe("#003366");
  });

  it("preserves non-color style props in rawLines (e.g. stroke-width)", () => {
    const src = `flowchart TD
  A[A]
  A --> B
  style A fill:#fff,stroke-width:3px
`;
    const out = parseMermaid(src);
    if (!out.ok) throw new Error(out.message);
    const a = out.ir.nodes.find((n) => n.id === "A");
    expect(a?.color).toBe("#fff");
    // The non-color portion should survive as a raw style directive.
    expect(out.ir.rawLines.some((l) => l.includes("stroke-width"))).toBe(true);
  });
});

describe("flowchart — subgraph as edge endpoint", () => {
  it("does not synthesise a phantom node when an edge targets a subgraph id", () => {
    const src = `flowchart TD
  subgraph SG1
    A
  end
  X --> SG1
`;
    const out = parseMermaid(src);
    if (!out.ok) throw new Error(out.message);
    // SG1 must be a subgraph, not a node.
    expect(out.ir.nodes.some((n) => n.id === "SG1")).toBe(false);
    expect(out.ir.subgraphs.some((s) => s.id === "SG1")).toBe(true);
    // The edge endpoint still references the subgraph id verbatim.
    expect(out.ir.edges[0]).toMatchObject({ source: "X", target: "SG1" });
  });

  it("regenerates `X --> SG1` as a bare edge to the subgraph", () => {
    const src = `flowchart TD
  subgraph SG1
    A
  end
  X --> SG1
`;
    const out = parseMermaid(src);
    if (!out.ok) throw new Error(out.message);
    const generated = generateMermaid(out.ir);
    expect(generated).toMatch(/X\s+-+>\s+SG1/);
  });
});

describe("flowchart — nested subgraphs", () => {
  it("preserves parent relationship across round-trip", () => {
    const src = `flowchart TD
  subgraph Outer
    subgraph Inner
      A
    end
  end
`;
    const out = parseMermaid(src);
    if (!out.ok) throw new Error(out.message);
    const inner = out.ir.subgraphs.find((s) => s.id === "Inner");
    expect(inner?.parent).toBe("Outer");
    const generated = generateMermaid(out.ir);
    const out2 = parseMermaid(generated);
    if (!out2.ok) throw new Error(out2.message);
    const inner2 = out2.ir.subgraphs.find((s) => s.id === "Inner");
    expect(inner2?.parent).toBe("Outer");
  });
});
