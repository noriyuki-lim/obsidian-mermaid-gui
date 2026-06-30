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
  subgraphFrames: {},
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

  it("uses subgraph direction for edges inside that subgraph", () => {
    const ir = baseIR("TD");
    ir.nodes[0].subgraph = "S1";
    ir.nodes[1].subgraph = "S1";
    ir.subgraphs = [{ id: "S1", label: "Group", parent: null, direction: "LR" }];

    const { edges } = irToFlow(ir, ir.positions);

    expect(edges[0]).toMatchObject({ sourceHandle: "s-right", targetHandle: "t-left" });
  });

  it("keeps chart direction for edges that target a subgraph from outside", () => {
    const ir = baseIR("TD");
    ir.nodes[1].subgraph = "S1";
    ir.subgraphs = [{ id: "S1", label: "Group", parent: null, direction: "LR" }];
    ir.edges = [{ id: "e1", source: "A", target: "S1", style: "solid", head: "arrow", length: 2 }];

    const { edges } = irToFlow(ir, ir.positions);

    expect(edges[0]).toMatchObject({
      source: "A",
      target: ":sg:S1",
      sourceHandle: "s-bottom",
      targetHandle: "t-top",
    });
  });

  it("uses the requested editor edge type", () => {
    const ir = baseIR("TD");

    expect(irToFlow(ir, ir.positions, "bezier").edges[0].type).toBe("bezier");
    expect(irToFlow(ir, ir.positions, "smoothstep").edges[0].type).toBe("smoothstep");
  });

  it("prefers stored GUI handles over direction defaults", () => {
    const ir = baseIR("TD");
    ir.edges[0].sourceHandle = "s-right";
    ir.edges[0].targetHandle = "t-left";
    const { edges } = irToFlow(ir, ir.positions);
    expect(edges[0]).toMatchObject({ sourceHandle: "s-right", targetHandle: "t-left" });
  });

  it("uses saved subgraph frames when present", () => {
    const ir = baseIR("TD");
    ir.nodes[0].subgraph = "S1";
    ir.subgraphs = [{ id: "S1", label: "Group", parent: null }];
    ir.subgraphFrames = { S1: { x: 15, y: 25, width: 260, height: 150 } };
    const { nodes } = irToFlow(ir, ir.positions);
    const sg = nodes.find((n) => n.id === ":sg:S1");
    expect(sg).toMatchObject({
      position: { x: 15, y: 25 },
      draggable: true,
      selectable: true,
      deletable: true,
    });
    expect(sg?.style).toMatchObject({ width: 260, height: 150 });
  });

  it("keeps regular nodes above draggable subgraphs", () => {
    const ir = baseIR("TD");
    ir.nodes[0].subgraph = "S1";
    ir.subgraphs = [{ id: "S1", label: "Group", parent: null }];

    const { nodes } = irToFlow(ir, ir.positions);
    const sg = nodes.find((n) => n.id === ":sg:S1");
    const node = nodes.find((n) => n.id === "A");

    expect(sg).toMatchObject({ draggable: true, zIndex: 0 });
    expect(sg).not.toHaveProperty("dragHandle");
    // Nodes paint above any nested subgraph backdrop, regardless of depth.
    expect(node).toMatchObject({ zIndex: 1000 });
  });

  it("routes edge endpoints that reference a subgraph through the :sg: flow id", () => {
    const ir = baseIR("TD");
    ir.subgraphs = [{ id: "S1", label: "Group", parent: null }];
    // Replace B with an edge to S1 (the subgraph itself).
    ir.edges = [{ id: "e1", source: "A", target: "S1", style: "solid", head: "arrow", length: 2 }];
    const { edges } = irToFlow(ir, ir.positions);
    expect(edges[0]).toMatchObject({ source: "A", target: ":sg:S1" });
  });

  it("nested subgraphs receive increasing zIndex by depth", () => {
    const ir = baseIR("TD");
    ir.subgraphs = [
      { id: "Outer", parent: null },
      { id: "Inner", parent: "Outer" },
    ];
    const { nodes } = irToFlow(ir, ir.positions);
    const outer = nodes.find((n) => n.id === ":sg:Outer");
    const inner = nodes.find((n) => n.id === ":sg:Inner");
    expect(outer).toMatchObject({ zIndex: 0 });
    expect(inner).toMatchObject({ zIndex: 1 });
  });

  it("passes color/borderColor through to flow node data", () => {
    const ir = baseIR("TD");
    ir.nodes[0].color = "#ff9999";
    ir.nodes[0].borderColor = "#003366";
    ir.subgraphs = [{ id: "S1", parent: null, color: "#eef", borderColor: "#88f" }];
    const { nodes } = irToFlow(ir, ir.positions);
    const nodeA = nodes.find((n) => n.id === "A");
    const sg = nodes.find((n) => n.id === ":sg:S1");
    expect(nodeA?.data).toMatchObject({ color: "#ff9999", borderColor: "#003366" });
    expect(sg?.data).toMatchObject({ color: "#eef", borderColor: "#88f" });
  });
});
