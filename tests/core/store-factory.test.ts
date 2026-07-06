import { describe, expect, it } from "vitest";
import { createEditorStore } from "../../src/core/store-factory";
import type { MermaidIR } from "../../src/core/ir-types";

// `applyIR` fills in any position missing from the store's *previous* state
// via a fresh dagre layout (see fillMissingPositions in store-factory.ts) —
// on a brand-new store that previous state is empty, so it silently
// recomputes every position and discards whatever `ir.positions` the caller
// asked for. Tests that depend on exact, hand-picked coordinates (jitter
// scenarios in particular) must reassert them straight into the store state
// after applyIR to bypass that recompute.
const applyIRWithExactPositions = (
  store: ReturnType<typeof createEditorStore>,
  ir: MermaidIR,
) => {
  store.getState().applyIR(ir, { recordHistory: false });
  store.setState((state) => ({ ir: { ...state.ir, positions: { ...ir.positions } } }));
};

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
  it("changes editor edge display without changing Mermaid text", () => {
    const store = createEditorStore();
    const before = store.getState().text;

    store.getState().setEditorEdgeType("smoothstep");

    expect(store.getState().editorEdgeType).toBe("smoothstep");
    expect(store.getState().text).toBe(before);
    expect(store.getState().past).toEqual([]);
  });

  it("updates subgraph labels without changing grouped nodes", () => {
    const store = createEditorStore();
    store.getState().applyIR(groupedIR(), { recordHistory: false });

    store.getState().updateSubgraph("S1", { label: "Renamed" });

    const state = store.getState();
    expect(state.ir.subgraphs[0]).toMatchObject({ id: "S1", label: "Renamed" });
    expect(state.ir.nodes.find((n) => n.id === "A")?.subgraph).toBe("S1");
  });

  it("updates subgraph direction and writes it to Mermaid text", () => {
    const store = createEditorStore();
    store.getState().applyIR(groupedIR(), { recordHistory: false });

    store.getState().updateSubgraph("S1", { direction: "LR" });

    const state = store.getState();
    expect(state.ir.subgraphs[0]).toMatchObject({ id: "S1", direction: "LR" });
    expect(state.text).toContain("direction LR");
    expect(state.ir.subgraphFrames).toEqual({});
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

  it("sorts Mermaid source by current canvas order on request", () => {
    const store = createEditorStore();
    store.getState().applyIR(
      {
        direction: "TD",
        nodes: [
          { id: "C", shape: "round", label: "C", subgraph: null },
          { id: "A", shape: "round", label: "A", subgraph: null },
          { id: "B", shape: "round", label: "B", subgraph: null },
        ],
        edges: [
          { id: "e2", source: "B", target: "C", style: "solid", head: "arrow", length: 2 },
          { id: "e1", source: "A", target: "B", style: "solid", head: "arrow", length: 2 },
        ],
        subgraphs: [],
        rawLines: [],
        positions: {
          A: { x: 0, y: 0 },
          B: { x: 200, y: 0 },
          C: { x: 100, y: 180 },
        },
        subgraphFrames: {},
      },
      { recordHistory: false },
    );

    store.getState().sortSourceByCanvas();

    const state = store.getState();
    expect(state.ir.nodes.map((node) => node.id)).toEqual(["A", "B", "C"]);
    expect(state.ir.edges.map((edge) => edge.id)).toEqual(["e1", "e2"]);
    expect(state.text.indexOf("A(")).toBeLessThan(state.text.indexOf("B("));
    expect(state.text.indexOf("B --> C")).toBeGreaterThan(state.text.indexOf("A --> B"));
  });

  // Target spec for the graph-rank redesign discussed in backlog/features_2026-06-13.md
  // ("Sort source by Canvas の挙動が安定しない"). Same-rank siblings (same distance
  // from a root, same distance to a shared descendant) must sort by their cross-axis
  // coordinate (x for TD/BT) even when their primary-axis coordinate (y) is only
  // jittered rather than pixel-identical. These two tests fail against today's
  // pure position-comparator implementation by design — they define the behaviour
  // the rank-aware comparator still needs to deliver.
  it("orders same-rank fan-out/fan-in siblings by x even when their y is jittered, not aligned", () => {
    const store = createEditorStore();
    applyIRWithExactPositions(store, {
      direction: "TD",
      nodes: [
        { id: "R", shape: "round", label: "R", subgraph: null },
        { id: "N1", shape: "rect", label: "N1", subgraph: null },
        { id: "N2", shape: "rect", label: "N2", subgraph: null },
        { id: "N3", shape: "rect", label: "N3", subgraph: null },
        { id: "M", shape: "round", label: "M", subgraph: null },
      ],
      edges: [
        { id: "e_R_N1", source: "R", target: "N1", style: "solid", head: "arrow", length: 2 },
        { id: "e_R_N2", source: "R", target: "N2", style: "solid", head: "arrow", length: 2 },
        { id: "e_R_N3", source: "R", target: "N3", style: "solid", head: "arrow", length: 2 },
        { id: "e_N1_M", source: "N1", target: "M", style: "solid", head: "arrow", length: 2 },
        { id: "e_N2_M", source: "N2", target: "M", style: "solid", head: "arrow", length: 2 },
        { id: "e_N3_M", source: "N3", target: "M", style: "solid", head: "arrow", length: 2 },
      ],
      subgraphs: [],
      rawLines: [],
      positions: {
        R: { x: 100, y: 0 },
        // Same rank (all children of R, all parents of M) but y is jittered
        // (96 / 100 / 104) instead of perfectly aligned, mirroring what
        // auto-layout / manual dragging actually produces.
        N1: { x: 250, y: 96 },
        N2: { x: 0, y: 100 },
        N3: { x: 130, y: 104 },
        M: { x: 100, y: 220 },
      },
      subgraphFrames: {},
    });

    store.getState().sortSourceByCanvas();

    const state = store.getState();
    // Left-to-right by x within the shared rank, NOT the jittered y (which
    // would instead produce N1, N2, N3).
    expect(state.ir.nodes.map((node) => node.id)).toEqual(["R", "N2", "N3", "N1", "M"]);
    expect(state.ir.edges.map((edge) => edge.id)).toEqual([
      "e_R_N2",
      "e_R_N3",
      "e_R_N1",
      "e_N2_M",
      "e_N3_M",
      "e_N1_M",
    ]);
  });

  it("reorders fan-out siblings by x across a subgraph boundary (reported bug scenario)", () => {
    const store = createEditorStore();
    applyIRWithExactPositions(store, {
      direction: "TD",
      nodes: [
        { id: "n1", shape: "rect", label: "n1", subgraph: null },
        { id: "n2", shape: "rect", label: "n2", subgraph: "sg_1" },
        { id: "n6", shape: "rect", label: "n6", subgraph: "sg_1" },
        { id: "n3", shape: "rhombus", label: "n3", subgraph: null },
        { id: "n4", shape: "rect", label: "n4", subgraph: null },
        { id: "n5", shape: "rect", label: "n5", subgraph: null },
        { id: "n7", shape: "rect", label: "n7", subgraph: null },
        { id: "n8", shape: "rect", label: "n8", subgraph: null },
      ],
      edges: [
        { id: "e1", source: "n1", target: "sg_1", style: "solid", head: "arrow", length: 2 },
        { id: "e2", source: "n2", target: "n6", style: "solid", head: "arrow", length: 2 },
        { id: "e3", source: "n3", target: "n4", style: "solid", head: "arrow", length: 2 },
        { id: "e4", source: "n3", target: "n5", style: "solid", head: "arrow", length: 2 },
        { id: "e5", source: "n3", target: "n7", style: "solid", head: "arrow", length: 2 },
        { id: "e6", source: "n4", target: "n8", style: "solid", head: "arrow", length: 2 },
        { id: "e7", source: "n5", target: "n8", style: "solid", head: "arrow", length: 2 },
        { id: "e8", source: "n7", target: "n8", style: "solid", head: "arrow", length: 2 },
        { id: "e9", source: "sg_1", target: "n3", style: "solid", head: "arrow", length: 2 },
      ],
      subgraphs: [{ id: "sg_1", label: "sg_1", parent: null, direction: "LR" }],
      rawLines: [],
      positions: {
        n1: { x: 400, y: 0 },
        n2: { x: 360, y: 130 },
        n6: { x: 470, y: 130 },
        n3: { x: 400, y: 260 },
        // Same rank (children of n3 / parents of n8) but y is jittered
        // instead of perfectly aligned — this is the exact scenario from
        // the bug report.
        n4: { x: 250, y: 398 },
        n7: { x: 400, y: 392 },
        n5: { x: 520, y: 404 },
        n8: { x: 400, y: 520 },
      },
      subgraphFrames: { sg_1: { x: 350, y: 100, width: 200, height: 120 } },
    });

    store.getState().sortSourceByCanvas();

    const order = store.getState().ir.nodes.map((node) => node.id);
    // x-ascending within the shared rank: n4 (250) < n7 (400) < n5 (520) —
    // NOT the y-ascending n7 / n4 / n5 that today's position-only comparator
    // produces from y = 392 / 398 / 404.
    expect(order.indexOf("n4")).toBeLessThan(order.indexOf("n7"));
    expect(order.indexOf("n7")).toBeLessThan(order.indexOf("n5"));
    // Topology must still be respected regardless of the cross-axis tie-break.
    expect(order.indexOf("n1")).toBeLessThan(order.indexOf("n3"));
    expect(order.indexOf("n3")).toBeLessThan(order.indexOf("n4"));
    expect(order.indexOf("n8")).toBeGreaterThan(order.indexOf("n4"));
    expect(order.indexOf("n8")).toBeGreaterThan(order.indexOf("n5"));
    expect(order.indexOf("n8")).toBeGreaterThan(order.indexOf("n7"));
  });

  it("orders same-rank siblings by y in an LR diagram when x is jittered (axis swap)", () => {
    const store = createEditorStore();
    applyIRWithExactPositions(store, {
      direction: "LR",
      nodes: [
        { id: "R", shape: "round", label: "R", subgraph: null },
        { id: "N1", shape: "rect", label: "N1", subgraph: null },
        { id: "N2", shape: "rect", label: "N2", subgraph: null },
        { id: "N3", shape: "rect", label: "N3", subgraph: null },
        { id: "M", shape: "round", label: "M", subgraph: null },
      ],
      edges: [
        { id: "e_R_N1", source: "R", target: "N1", style: "solid", head: "arrow", length: 2 },
        { id: "e_R_N2", source: "R", target: "N2", style: "solid", head: "arrow", length: 2 },
        { id: "e_R_N3", source: "R", target: "N3", style: "solid", head: "arrow", length: 2 },
        { id: "e_N1_M", source: "N1", target: "M", style: "solid", head: "arrow", length: 2 },
        { id: "e_N2_M", source: "N2", target: "M", style: "solid", head: "arrow", length: 2 },
        { id: "e_N3_M", source: "N3", target: "M", style: "solid", head: "arrow", length: 2 },
      ],
      subgraphs: [],
      rawLines: [],
      positions: {
        R: { x: 0, y: 100 },
        // Same rank, but x (the LR primary axis) is jittered (96/100/104)
        // instead of aligned — the cross-axis for LR is y, and that is what
        // should decide the order among siblings.
        N1: { x: 96, y: 250 },
        N2: { x: 100, y: 0 },
        N3: { x: 104, y: 130 },
        M: { x: 220, y: 100 },
      },
      subgraphFrames: {},
    });

    store.getState().sortSourceByCanvas();

    const state = store.getState();
    // Top-to-bottom by y within the shared rank, NOT the jittered x (which
    // would instead produce N1, N2, N3).
    expect(state.ir.nodes.map((node) => node.id)).toEqual(["R", "N2", "N3", "N1", "M"]);
    expect(state.ir.edges.map((edge) => edge.id)).toEqual([
      "e_R_N2",
      "e_R_N3",
      "e_R_N1",
      "e_N2_M",
      "e_N3_M",
      "e_N1_M",
    ]);
  });

  it("keeps root-before-leaf order in a BT diagram when the primary axis is jittered (sign flip)", () => {
    const store = createEditorStore();
    applyIRWithExactPositions(store, {
      direction: "BT",
      nodes: [
        { id: "R", shape: "round", label: "R", subgraph: null },
        { id: "N1", shape: "rect", label: "N1", subgraph: null },
        { id: "N2", shape: "rect", label: "N2", subgraph: null },
        { id: "N3", shape: "rect", label: "N3", subgraph: null },
        { id: "M", shape: "round", label: "M", subgraph: null },
      ],
      edges: [
        { id: "e_R_N1", source: "R", target: "N1", style: "solid", head: "arrow", length: 2 },
        { id: "e_R_N2", source: "R", target: "N2", style: "solid", head: "arrow", length: 2 },
        { id: "e_R_N3", source: "R", target: "N3", style: "solid", head: "arrow", length: 2 },
        { id: "e_N1_M", source: "N1", target: "M", style: "solid", head: "arrow", length: 2 },
        { id: "e_N2_M", source: "N2", target: "M", style: "solid", head: "arrow", length: 2 },
        { id: "e_N3_M", source: "N3", target: "M", style: "solid", head: "arrow", length: 2 },
      ],
      subgraphs: [],
      rawLines: [],
      positions: {
        // BT flows bottom-to-top, so the root sits at the largest y.
        R: { x: 100, y: 220 },
        // Same rank, y (the BT primary axis) is jittered (104/100/96)
        // instead of aligned — x is the cross-axis and should decide order.
        N1: { x: 250, y: 104 },
        N2: { x: 0, y: 100 },
        N3: { x: 130, y: 96 },
        M: { x: 100, y: 0 },
      },
      subgraphFrames: {},
    });

    store.getState().sortSourceByCanvas();

    const state = store.getState();
    // Root first, leaf last (rank order must not flip just because BT sorts
    // its primary axis in descending pixel order), and x-ascending within
    // the shared rank rather than the jittered y (which would instead
    // produce R, N1, N2, N3, M).
    expect(state.ir.nodes.map((node) => node.id)).toEqual(["R", "N2", "N3", "N1", "M"]);
    expect(state.ir.edges.map((edge) => edge.id)).toEqual([
      "e_R_N2",
      "e_R_N3",
      "e_R_N1",
      "e_N2_M",
      "e_N3_M",
      "e_N1_M",
    ]);
  });
});
