import { describe, expect, it } from "vitest";
import { irToFlow } from "../../src/ui/adapter";
import type { MermaidIR } from "../../src/core/ir-types";

const baseIR = (direction: MermaidIR["direction"]): MermaidIR => ({
  direction,
  nodes: [
    { id: "A", shape: "rect", label: "A", subgraph: null },
    { id: "B", shape: "rect", label: "B", subgraph: null },
  ],
  edges: [{ id: "e1", source: "A", target: "B", style: "solid", head: "arrow", length: 2 }],
  subgraphs: [],
  rawLines: [],
  positions: { A: { x: 0, y: 0 }, B: { x: 220, y: 0 } },
});

describe("irToFlow edge handles", () => {
  it("uses right-to-left handles for LR flowcharts", () => {
    const { edges } = irToFlow(baseIR("LR"), baseIR("LR").positions);
    expect(edges[0]).toMatchObject({ sourceHandle: "s-right", targetHandle: "t-left" });
  });

  it("uses vertical handles for TD flowcharts", () => {
    const { edges } = irToFlow(baseIR("TD"), baseIR("TD").positions);
    expect(edges[0]).toMatchObject({ sourceHandle: "s-bottom", targetHandle: "t-top" });
  });

  it("prefers stored GUI handles over direction defaults", () => {
    const ir = baseIR("TD");
    ir.edges[0].sourceHandle = "s-right";
    ir.edges[0].targetHandle = "t-left";
    const { edges } = irToFlow(ir, ir.positions);
    expect(edges[0]).toMatchObject({ sourceHandle: "s-right", targetHandle: "t-left" });
  });
});
