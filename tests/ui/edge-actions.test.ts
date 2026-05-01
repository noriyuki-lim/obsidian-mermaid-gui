import { describe, expect, it } from "vitest";
import {
  findEdgeForHandleUpdate,
  normalizeNewConnection,
  normalizeReconnect,
} from "../../src/ui/canvas/edgeActions";
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

describe("connection normalization", () => {
  it("keeps drag direction from a target handle by flipping React Flow's loose connection", () => {
    expect(
      normalizeNewConnection(
        { source: "B", sourceHandle: "s-left", target: "A", targetHandle: "t-right" },
        { nodeId: "A", handleId: "t-right", handleType: "target" },
      ),
    ).toEqual({
      source: "A",
      target: "B",
      sourceHandle: "s-right",
      targetHandle: "t-left",
    });
  });

  it("preserves edge direction when reconnecting the target endpoint", () => {
    expect(
      normalizeReconnect(
        { ...edge("e1"), source: "B", target: "D", sourceHandle: "s-bottom", targetHandle: "t-top" },
        { source: "B", sourceHandle: "s-bottom", target: "D", targetHandle: "s-left" },
        "target",
      ),
    ).toMatchObject({
      source: "B",
      target: "D",
      sourceHandle: "s-bottom",
      targetHandle: "t-left",
    });
  });

  it("absorbs accidental self-loop while moving a target endpoint as source-handle change", () => {
    expect(
      normalizeReconnect(
        { ...edge("e1"), source: "B", target: "D", sourceHandle: "s-bottom", targetHandle: "t-top" },
        { source: "D", sourceHandle: "t-right", target: "B", targetHandle: "s-bottom" },
        "target",
      ),
    ).toMatchObject({
      source: "B",
      target: "D",
      sourceHandle: "s-bottom",
      targetHandle: "t-top",
    });
  });
});
