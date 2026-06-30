import { describe, expect, it } from "vitest";
import { computeLayout, NODE_SIZE } from "../../src/core/dagre";
import type { IREdge, IRNode, IRSubgraph } from "../../src/core/ir-types";

const nodes: IRNode[] = [
  { id: "A", shape: "rect", label: "A", subgraph: "S1" },
  { id: "B", shape: "rect", label: "B", subgraph: "S1" },
  { id: "C", shape: "rect", label: "C", subgraph: null },
];

const edges: IREdge[] = [
  { id: "e1", source: "A", target: "B", style: "solid", head: "arrow", length: 2 },
  { id: "e2", source: "B", target: "C", style: "solid", head: "arrow", length: 2 },
];

describe("computeLayout", () => {
  it("uses subgraph direction for nodes inside that subgraph", () => {
    const subgraphs: IRSubgraph[] = [{ id: "S1", direction: "LR" }];

    const positions = computeLayout(nodes, edges, subgraphs, "TD");

    expect(positions.B.x).toBeGreaterThan(positions.A.x);
    expect(Math.abs(positions.B.y - positions.A.y)).toBeLessThan(40);
  });

  it("places an outside source above a subgraph target in a TD chart", () => {
    const caseNodes: IRNode[] = [
      { id: "n1", shape: "rect", label: "開始", subgraph: null },
      { id: "n4", shape: "rect", label: "左", subgraph: "sg_1" },
      { id: "n5", shape: "rect", label: "中", subgraph: "sg_1" },
      { id: "n6", shape: "rect", label: "次", subgraph: null },
      { id: "n7", shape: "rect", label: "さらに次", subgraph: null },
    ];
    const caseEdges: IREdge[] = [
      { id: "e1", source: "n4", target: "n5", style: "solid", head: "arrow", length: 2 },
      { id: "e2", source: "n1", target: "sg_1", style: "solid", head: "arrow", length: 2 },
      { id: "e3", source: "sg_1", target: "n6", style: "solid", head: "arrow", length: 2 },
      { id: "e4", source: "n6", target: "n7", style: "solid", head: "arrow", length: 2 },
    ];
    const subgraphs: IRSubgraph[] = [{ id: "sg_1", label: "サブグラフ", direction: "LR" }];

    const positions = computeLayout(caseNodes, caseEdges, subgraphs, "TD");

    expect(positions.n5.x).toBeGreaterThan(positions.n4.x);
    expect(Math.abs(positions.n5.y - positions.n4.y)).toBeLessThan(40);
    const subgraphTop = Math.min(positions.n4.y, positions.n5.y) - 24 - 30;
    const subgraphBottom = Math.max(positions.n4.y, positions.n5.y) + NODE_SIZE.height + 24;
    const sourceBottom = positions.n1.y + NODE_SIZE.height;
    const visibleGap = subgraphTop - sourceBottom;
    expect(sourceBottom).toBeLessThan(subgraphTop);
    expect(visibleGap).toBeGreaterThanOrEqual(0);
    expect(visibleGap).toBeLessThanOrEqual(100);
    const outgoingGap = positions.n6.y - subgraphBottom;
    expect(outgoingGap).toBeGreaterThanOrEqual(0);
    expect(outgoingGap).toBeLessThanOrEqual(100);
    const downstreamGap = positions.n7.y - (positions.n6.y + NODE_SIZE.height);
    expect(downstreamGap).toBeGreaterThanOrEqual(0);
    expect(downstreamGap).toBeLessThanOrEqual(90);
    const subgraphCenterX =
      (Math.min(positions.n4.x, positions.n5.x) +
        Math.max(positions.n4.x, positions.n5.x) +
        NODE_SIZE.width) /
      2;
    expect(Math.abs(positions.n1.x + NODE_SIZE.width / 2 - subgraphCenterX)).toBeLessThan(1);
    expect(Math.abs(positions.n6.x + NODE_SIZE.width / 2 - subgraphCenterX)).toBeLessThan(1);
  });

  it("keeps branched downstream nodes below their source when a subgraph is in the chain", () => {
    const caseNodes: IRNode[] = [
      { id: "n1", shape: "rect", label: "n1", subgraph: null },
      { id: "n2", shape: "rect", label: "n2", subgraph: "sg_1" },
      { id: "n6", shape: "rect", label: "n6", subgraph: "sg_1" },
      { id: "n3", shape: "rhombus", label: "n3", subgraph: null },
      { id: "n4", shape: "rect", label: "n4", subgraph: null },
      { id: "n5", shape: "rect", label: "n5", subgraph: null },
      { id: "n8", shape: "rect", label: "n8", subgraph: null },
    ];
    const caseEdges: IREdge[] = [
      { id: "e1", source: "n1", target: "sg_1", style: "solid", head: "arrow", length: 2 },
      { id: "e2", source: "sg_1", target: "n3", style: "solid", head: "arrow", length: 2 },
      { id: "e3", source: "n3", target: "n5", style: "solid", head: "arrow", length: 2 },
      { id: "e4", source: "n3", target: "n4", style: "solid", head: "arrow", length: 2 },
      { id: "e5", source: "n3", target: "n8", style: "solid", head: "arrow", length: 2 },
      { id: "e6", source: "n2", target: "n6", style: "solid", head: "arrow", length: 2 },
    ];
    const subgraphs: IRSubgraph[] = [{ id: "sg_1", label: "sg_1", direction: "LR" }];

    const positions = computeLayout(caseNodes, caseEdges, subgraphs, "TD");

    expect(positions.n6.x).toBeGreaterThan(positions.n2.x);
    expect(positions.n3.y).toBeGreaterThan(positions.n2.y);
    for (const id of ["n4", "n5", "n8"]) {
      expect(positions[id].y).toBeGreaterThan(positions.n3.y);
    }
  });

  it("falls back to the chart direction when a subgraph has no direction", () => {
    const subgraphs: IRSubgraph[] = [{ id: "S1" }];

    const positions = computeLayout(nodes, edges, subgraphs, "TD");

    expect(positions.B.y).toBeGreaterThan(positions.A.y);
  });
});
