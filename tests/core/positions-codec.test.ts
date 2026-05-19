import { describe, expect, it } from "vitest";
import { decodeBlock, encodeBlock, stripGuiMetadata } from "../../src/core/positions-codec";
import type { MermaidIR } from "../../src/core/ir-types";

const SOURCE = `%% gui:positions {"A":[120,40],"B":[260,140]}
%% gui:meta {"version":1,"layout":"dagre"}
flowchart LR
  A[Start] --> B[End]
`;

describe("positions-codec", () => {
  it("decodes a block with gui:positions and removes them from rawLines", () => {
    const decoded = decodeBlock(SOURCE);
    expect(decoded.parse.ok).toBe(true);
    if (!decoded.parse.ok) return;
    expect(decoded.positions).toEqual({
      A: { x: 120, y: 40 },
      B: { x: 260, y: 140 },
    });
    expect(decoded.meta).toEqual({ version: 1, layout: "dagre" });
    expect(decoded.parse.ir.rawLines.some((l) => l.includes("gui:positions"))).toBe(false);
    expect(decoded.parse.ir.rawLines.some((l) => l.includes("gui:meta"))).toBe(false);
  });

  it("falls through cleanly when no gui comments are present", () => {
    const src = "flowchart TD\n  A --> B\n";
    const decoded = decodeBlock(src);
    expect(decoded.parse.ok).toBe(true);
    expect(decoded.positions).toEqual({});
    expect(decoded.meta).toBeNull();
  });

  it("does not encode GUI position metadata", () => {
    const ir: MermaidIR = {
      direction: "LR",
      nodes: [
        { id: "A", shape: "rect", label: "Start", subgraph: null },
        { id: "B", shape: "rect", label: "End", subgraph: null },
      ],
      edges: [{ id: "e1", source: "A", target: "B", style: "solid", head: "arrow", length: 2 }],
      subgraphs: [],
      rawLines: [],
      positions: { A: { x: 120, y: 40 }, B: { x: 260, y: 140 } },
      subgraphFrames: {},
    };
    const encoded = encodeBlock(ir);
    expect(encoded).not.toContain("gui:positions");
    expect(encoded).not.toContain("gui:subgraphs");
    expect(encoded).not.toContain("gui:edges");
    expect(encoded).not.toContain("gui:meta");
  });

  it("does not encode GUI edge handles", () => {
    const ir: MermaidIR = {
      direction: "TD",
      nodes: [
        { id: "A", shape: "rect", label: "A", subgraph: null },
        { id: "B", shape: "rect", label: "B", subgraph: null },
      ],
      edges: [
        {
          id: "local-id",
          source: "A",
          target: "B",
          style: "solid",
          head: "arrow",
          length: 2,
          sourceHandle: "s-right",
          targetHandle: "t-left",
        },
      ],
      subgraphs: [],
      rawLines: [],
      positions: {},
      subgraphFrames: {},
    };
    const encoded = encodeBlock(ir);
    expect(encoded).not.toContain("gui:edges");

    const decoded = decodeBlock(encoded);
    if (!decoded.parse.ok) throw new Error("parse failed");
    expect(decoded.parse.ir.edges[0]).toMatchObject({
      source: "A",
      target: "B",
      style: "solid",
      head: "arrow",
    });
    expect(decoded.parse.ir.edges[0]).not.toHaveProperty("sourceHandle");
    expect(decoded.parse.ir.edges[0]).not.toHaveProperty("targetHandle");
  });

  it("does not encode subgraph frame metadata", () => {
    const ir: MermaidIR = {
      direction: "TD",
      nodes: [{ id: "A", shape: "rect", label: "A", subgraph: "S1" }],
      edges: [],
      subgraphs: [{ id: "S1", label: "Group", parent: null }],
      rawLines: [],
      positions: { A: { x: 10, y: 20 } },
      subgraphFrames: { S1: { x: 0, y: 0, width: 240, height: 140 } },
    };
    const encoded = encodeBlock(ir);
    expect(encoded).not.toContain("gui:positions");
    expect(encoded).not.toContain("gui:subgraphs");
    expect(encoded).not.toContain("gui:meta");
    expect(encoded).not.toContain("gui:edges");
    const decoded = decodeBlock(encoded);
    if (!decoded.parse.ok) throw new Error("parse failed");
    expect(decoded.subgraphFrames).toEqual({});
    expect(decoded.parse.ir.subgraphFrames).toEqual({});
  });

  it("stripGuiMetadata strips gui comments from non-flowchart source", () => {
    const src = `%% gui:positions {"A":[0,0]}
%% gui:meta {"version":2}
sequenceDiagram
  A->>B: hello`;
    const stripped = stripGuiMetadata(src);
    expect(stripped).not.toContain("gui:positions");
    expect(stripped).not.toContain("gui:meta");
    expect(stripped).toContain("sequenceDiagram");
    expect(stripped).toContain("A->>B: hello");
  });

  it("stripGuiMetadata returns unchanged source when no gui comments present in non-flowchart", () => {
    const src = "sequenceDiagram\n  A->>B: hello\n";
    const stripped = stripGuiMetadata(src);
    expect(stripped).toContain("sequenceDiagram");
  });

  it("returns renderable text from the flowchart header when parse fallback is needed", () => {
    const source = `Original:
%% gui:positions {"A":[0,0]}
%% gui:edges [{"sourceHandle":"s-right","targetHandle":"t-left"}]
flowchart TD
  A[Start] --> B[End]
  unsupported @@@
`;
    const stripped = stripGuiMetadata(source);
    expect(stripped.startsWith("flowchart TD")).toBe(true);
    expect(stripped).not.toContain("gui:positions");
    expect(stripped).not.toContain("gui:edges");
    expect(stripped).not.toContain("Original:");
  });
});
