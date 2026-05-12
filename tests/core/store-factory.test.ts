import { describe, expect, it } from "vitest";
import { createEditorStore } from "../../src/core/store-factory";
import type { MermaidIR } from "../../src/core/ir-types";

const groupedIR = (): MermaidIR => ({
  direction: "TD",
  nodes: [
    { id: "A", shape: "rect", label: "A", subgraph: "S1" },
    { id: "B", shape: "rect", label: "B", subgraph: null },
  ],
  edges: [{ id: "e1", source: "A", target: "B", style: "solid", head: "arrow", length: 2 }],
  subgraphs: [{ id: "S1", label: "Group", parent: null }],
  rawLines: [],
  positions: { A: { x: 10, y: 20 }, B: { x: 200, y: 20 } },
  subgraphFrames: { S1: { x: 0, y: 0, width: 180, height: 120 } },
  savePositions: true,
});

describe("subgraph editing store commands", () => {
  it("updates subgraph labels without changing grouped nodes", () => {
    const store = createEditorStore();
    store.getState().applyIR(groupedIR(), { recordHistory: false });

    store.getState().updateSubgraph("S1", { label: "Renamed" });

    const state = store.getState();
    expect(state.ir.subgraphs[0]).toMatchObject({ id: "S1", label: "Renamed" });
    expect(state.ir.nodes.find((n) => n.id === "A")?.subgraph).toBe("S1");
  });

  it("removes only the selected subgraph and keeps its nodes", () => {
    const store = createEditorStore();
    store.getState().applyIR(groupedIR(), { recordHistory: false });
    store.getState().setSelection({ nodeIds: [], edgeIds: [], subgraphIds: ["S1"] });

    store.getState().removeSelection();

    const state = store.getState();
    expect(state.ir.subgraphs).toEqual([]);
    expect(state.ir.nodes.map((n) => n.id)).toEqual(["A", "B"]);
    expect(state.ir.nodes.find((n) => n.id === "A")?.subgraph).toBeNull();
    expect(state.ir.subgraphFrames.S1).toBeUndefined();
  });

  it("removes selected nodes with incident edges and saved positions", () => {
    const store = createEditorStore();
    store.getState().applyIR(groupedIR(), { recordHistory: false });
    store.getState().setSelection({ nodeIds: ["A"], edgeIds: [], subgraphIds: [] });

    store.getState().removeSelection();

    const state = store.getState();
    expect(state.ir.nodes.map((n) => n.id)).toEqual(["B"]);
    expect(state.ir.edges).toEqual([]);
    expect(state.ir.positions.A).toBeUndefined();
    expect(state.selection).toEqual({ nodeIds: [], edgeIds: [], subgraphIds: [] });
  });

  it("removes selected edges without removing their nodes", () => {
    const store = createEditorStore();
    store.getState().applyIR(groupedIR(), { recordHistory: false });
    store.getState().setSelection({ nodeIds: [], edgeIds: ["e1"], subgraphIds: [] });

    store.getState().removeSelection();

    const state = store.getState();
    expect(state.ir.nodes.map((n) => n.id)).toEqual(["A", "B"]);
    expect(state.ir.edges).toEqual([]);
    expect(state.selection).toEqual({ nodeIds: [], edgeIds: [], subgraphIds: [] });
  });

  it("clears selected edges removed as a side effect of node deletion", () => {
    const store = createEditorStore();
    store.getState().applyIR(groupedIR(), { recordHistory: false });
    store.getState().setSelection({ nodeIds: [], edgeIds: ["e1"], subgraphIds: [] });

    store
      .getState()
      .removeSelection({ nodeIds: ["A"], edgeIds: [], subgraphIds: [] });

    const state = store.getState();
    expect(state.ir.edges).toEqual([]);
    expect(state.selection.edgeIds).toEqual([]);
  });
});
