import { describe, expect, it } from "vitest";
import { generateMermaid } from "../../src/core/generator";
import { parseMermaid } from "../../src/core/parser";
import type { MermaidIR } from "../../src/core/ir-types";

describe("generateMermaid", () => {
  it("keeps bare edge nodes explicit inside subgraphs so membership survives", () => {
    const ir: MermaidIR = {
      direction: "TD",
      curve: "basis",
      nodes: [
        { id: "A", shape: "rect", label: "A", subgraph: "S1" },
        { id: "B", shape: "rect", label: "B", subgraph: null },
      ],
      edges: [{ id: "e1", source: "A", target: "B", style: "solid", head: "arrow", length: 2 }],
      subgraphs: [{ id: "S1", label: "Group", parent: null }],
      rawLines: [],
      leadingRawLines: [],
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

  it("emits direction declarations inside subgraphs", () => {
    const ir: MermaidIR = {
      direction: "TD",
      curve: "basis",
      nodes: [
        { id: "A", shape: "rect", label: "A", subgraph: "S1" },
        { id: "B", shape: "rect", label: "B", subgraph: "S1" },
      ],
      edges: [{ id: "e1", source: "A", target: "B", style: "solid", head: "arrow", length: 2 }],
      subgraphs: [{ id: "S1", label: "Group", parent: null, direction: "LR" }],
      rawLines: [],
      leadingRawLines: [],
      positions: {},
      subgraphFrames: {},
    };

    const generated = generateMermaid(ir);

    expect(generated).toContain("subgraph S1 [Group]");
    expect(generated).toContain("direction LR");
  });

  it("omits the curve directive when curve is the basis default", () => {
    const ir: MermaidIR = {
      direction: "TD",
      curve: "basis",
      nodes: [],
      edges: [],
      subgraphs: [],
      rawLines: [],
      leadingRawLines: [],
      positions: {},
      subgraphFrames: {},
    };

    expect(generateMermaid(ir)).not.toContain("%%{init");
  });

  it("emits a curve directive before the header for a non-default curve", () => {
    const ir: MermaidIR = {
      direction: "TD",
      curve: "linear",
      nodes: [],
      edges: [],
      subgraphs: [],
      rawLines: [],
      leadingRawLines: [],
      positions: {},
      subgraphFrames: {},
    };

    const generated = generateMermaid(ir);
    const lines = generated.split("\n");
    expect(lines[0]).toBe('%%{init: {"flowchart": {"curve": "linear"}}}%%');
    expect(lines[1]).toBe("flowchart TD");

    const parsed = parseMermaid(generated);
    if (!parsed.ok) throw new Error("parse failed");
    expect(parsed.ir.curve).toBe("linear");
  });

  it("re-emits preserved leadingRawLines verbatim before the header", () => {
    const ir: MermaidIR = {
      direction: "TD",
      curve: "basis",
      nodes: [],
      edges: [],
      subgraphs: [],
      rawLines: [],
      leadingRawLines: [`%%{init: {"theme":"dark"}}%%`],
      positions: {},
      subgraphFrames: {},
    };

    const generated = generateMermaid(ir);
    const lines = generated.split("\n");
    expect(lines[0]).toBe(`%%{init: {"theme":"dark"}}%%`);
    expect(lines[1]).toBe("flowchart TD");
  });
});
