import { describe, expect, it } from "vitest";
import { findEdgeForHandleUpdate } from "../../src/ui/canvas/edgeActions";
import type { IREdge } from "../../src/core/ir-types";

const edge = (id: string, source = "A", target = "B"): IREdge => ({
  id,
  source,
  target,
  style: "solid",
  head: "arrow",
  length: 2,
});

describe("findEdgeForHandleUpdate", () => {
  it("updates the only matching edge instead of creating a duplicate", () => {
    expect(findEdgeForHandleUpdate([edge("e1")], { nodeIds: [], edgeIds: [] }, "A", "B")?.id).toBe(
      "e1",
    );
  });

  it("prefers the selected edge when parallel edges exist", () => {
    const edges = [edge("e1"), edge("e2")];
    expect(
      findEdgeForHandleUpdate(edges, { nodeIds: [], edgeIds: ["e2"] }, "A", "B")?.id,
    ).toBe("e2");
  });

  it("returns null for ambiguous unselected parallel edges", () => {
    const edges = [edge("e1"), edge("e2")];
    expect(findEdgeForHandleUpdate(edges, { nodeIds: [], edgeIds: [] }, "A", "B")).toBeNull();
  });
});
