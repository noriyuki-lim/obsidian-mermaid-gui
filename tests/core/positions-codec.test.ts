import { describe, expect, it } from "vitest";
import { decodeBlock, encodeBlock, GUI_VERSION } from "../../src/core/positions-codec";
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
    expect(
      decoded.parse.ir.rawLines.some((l) => l.includes("gui:positions")),
    ).toBe(false);
    expect(
      decoded.parse.ir.rawLines.some((l) => l.includes("gui:meta")),
    ).toBe(false);
  });

  it("falls through cleanly when no gui comments are present", () => {
    const src = "flowchart TD\n  A --> B\n";
    const decoded = decodeBlock(src);
    expect(decoded.parse.ok).toBe(true);
    expect(decoded.positions).toEqual({});
    expect(decoded.meta).toBeNull();
  });

  it("encodes positions just below the flowchart header", () => {
    const ir: MermaidIR = {
      direction: "LR",
      nodes: [
        { id: "A", shape: "rect", label: "Start", subgraph: null },
        { id: "B", shape: "rect", label: "End", subgraph: null },
      ],
      edges: [
        { id: "e1", source: "A", target: "B", style: "solid", head: "arrow", length: 2 },
      ],
      subgraphs: [],
      rawLines: [],
      positions: { A: { x: 120, y: 40 }, B: { x: 260, y: 140 } },
    };
    const encoded = encodeBlock(ir);
    const lines = encoded.split("\n");
    const headerIdx = lines.findIndex((l) => /^flowchart\s+LR/.test(l));
    expect(headerIdx).toBeGreaterThanOrEqual(0);
    expect(lines[headerIdx + 1]).toContain("gui:positions");
    expect(lines[headerIdx + 1]).toContain('"A":[120,40]');
    expect(lines[headerIdx + 2]).toContain("gui:meta");
    expect(lines[headerIdx + 2]).toContain(`"version":${GUI_VERSION}`);
  });

  it("round-trips: decode → encode keeps positions stable", () => {
    const decoded = decodeBlock(SOURCE);
    if (!decoded.parse.ok) throw new Error("parse failed");
    const ir = decoded.parse.ir;
    ir.positions = decoded.positions;
    const out = encodeBlock(ir);
    const again = decodeBlock(out);
    if (!again.parse.ok) throw new Error("re-parse failed");
    expect(again.positions).toEqual(decoded.positions);
  });
});
