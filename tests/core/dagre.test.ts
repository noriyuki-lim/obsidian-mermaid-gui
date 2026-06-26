import { describe, expect, it } from "vitest";
import { computeLayout } from "../../src/core/dagre";
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

  it("falls back to the chart direction when a subgraph has no direction", () => {
    const subgraphs: IRSubgraph[] = [{ id: "S1" }];

    const positions = computeLayout(nodes, edges, subgraphs, "TD");

    expect(positions.B.y).toBeGreaterThan(positions.A.y);
  });
});
