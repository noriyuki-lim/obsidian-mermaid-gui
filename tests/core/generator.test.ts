import { describe, expect, it } from "vitest";
import { generateMermaid } from "../../src/core/generator";
import { parseMermaid } from "../../src/core/parser";
import type { MermaidIR } from "../../src/core/ir-types";

describe("generateMermaid", () => {
  it("keeps bare edge nodes explicit inside subgraphs so membership survives", () => {
    const ir: MermaidIR = {
      direction: "TD",
      nodes: [
        { id: "A", shape: "rect", label: "A", subgraph: "S1" },
        { id: "B", shape: "rect", label: "B", subgraph: null },
      ],
      edges: [{ id: "e1", source: "A", target: "B", style: "solid", head: "arrow", length: 2 }],
      subgraphs: [{ id: "S1", label: "Group", parent: null }],
      rawLines: [],
      positions: {},
      subgraphFrames: {},
    };

    const generated = generateMermaid(ir);
    expect(generated).toContain("subgraph S1 [Group]");
    expect(generated).toContain("A[A]");

    const parsed = parseMermaid(generated);
    if (!parsed.ok) throw new Error("parse failed");
    expect(parsed.ir.nodes.find((n) => n.id === "A")?.subgraph).toBe("S1");
  });
});
