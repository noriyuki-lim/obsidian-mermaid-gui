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

  it("adds an edge whose endpoint is a subgraph id", () => {
    const store = createEditorStore();
    store.getState().applyIR(groupedIR(), { recordHistory: false });

    // B (node) → S1 (subgraph) — Mermaid allows edges onto a subgraph boundary.
    store.getState().addEdge("B", "S1");

    const edges = store.getState().ir.edges;
    expect(edges).toHaveLength(2);
    const added = edges.find((e) => e.source === "B" && e.target === "S1");
    expect(added, "edge with a subgraph endpoint should be created").toBeTruthy();
    // And it must survive serialisation (generator emits `B -...-> S1`).
    expect(store.getState().text).toMatch(/B\s*-+>\s*S1/);
  });

  it("rejects an edge whose endpoint matches neither a node nor a subgraph", () => {
    const store = createEditorStore();
    store.getState().applyIR(groupedIR(), { recordHistory: false });

    store.getState().addEdge("A", "ghost");

    expect(store.getState().ir.edges).toHaveLength(1);
  });

  it("resizes a subgraph frame without moving its nodes", () => {
    const store = createEditorStore();
    store.getState().applyIR(groupedIR(), { recordHistory: false });
    const before = { ...store.getState().ir.positions.A };

    store.getState().resizeSubgraph(
      "S1",
      { x: 5, y: 5, width: 300, height: 240 },
      { recordHistory: false },
    );

    const state = store.getState();
    expect(state.ir.subgraphFrames.S1).toEqual({ x: 5, y: 5, width: 300, height: 240 });
    // Contained node keeps its position — resize only reframes the box.
    expect(state.ir.positions.A).toEqual(before);
  });

  it("clears manually saved subgraph frames when auto-layout runs", () => {
    const store = createEditorStore();
    store.getState().applyIR(groupedIR(), { recordHistory: false });

    store.getState().moveSubgraph(
      "S1",
      { x: 100, y: 80 },
      { x: 100, y: 80, width: 180, height: 120 },
      { recordHistory: false },
    );
    expect(store.getState().ir.subgraphFrames.S1).toBeDefined();

    store.getState().autoLayout();

    const state = store.getState();
    expect(state.ir.subgraphFrames).toEqual({});
    expect(state.ir.nodes.find((n) => n.id === "A")?.subgraph).toBe("S1");
  });
});
