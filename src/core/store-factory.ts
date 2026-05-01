import { createStore, type StoreApi } from "zustand/vanilla";
import {
  emptyIR,
  type Direction,
  type IREdge,
  type IRNode,
  type IRSubgraph,
  type MermaidIR,
  type NodeShape,
  type Positions,
  type SubgraphFrames,
  type EdgeHandleId,
} from "./ir-types";
import { generateMermaid } from "./generator";
import { parseMermaid } from "./parser";
import { computeLayout } from "./dagre";

export type SyncStatus =
  | { kind: "ok" }
  | { kind: "error"; message: string; line?: number };

export interface Selection {
  nodeIds: string[];
  edgeIds: string[];
}

/* IR projections — kept as plain shapes here; UI wraps them into ReactFlow nodes. */
export interface FlowProjection {
  nodes: MermaidIR["nodes"];
  edges: MermaidIR["edges"];
  subgraphs: MermaidIR["subgraphs"];
  positions: Positions;
}

export interface EditorState {
  /* canonical state */
  ir: MermaidIR;
  text: string;
  /* sync */
  status: SyncStatus;
  warnings: string[];
  isTextDirty: boolean;
  /* selection */
  selection: Selection;
  /* history */
  past: MermaidIR[];
  future: MermaidIR[];

  /* commands */
  setText: (text: string) => void;
  commitText: () => void;
  applyIR: (ir: MermaidIR, opts?: { layout?: boolean; recordHistory?: boolean }) => void;
  setDirection: (d: Direction) => void;
  addNode: (shape: NodeShape, label?: string) => string;
  updateNode: (id: string, patch: Partial<IRNode>, opts?: { recordHistory?: boolean }) => void;
  removeSelection: (targets?: { nodeIds: string[]; edgeIds: string[] }) => void;
  setNodePosition: (id: string, pos: { x: number; y: number }) => void;
  setNodePositions: (
    changes: Array<{ id: string; pos: { x: number; y: number } }>,
    opts?: { recordHistory?: boolean; subgraphs?: Array<{ id: string; subgraph: string | null }> },
  ) => void;
  moveSubgraph: (
    id: string,
    delta: { x: number; y: number },
    frame: { x: number; y: number; width: number; height: number },
    opts?: { recordHistory?: boolean },
  ) => void;
  resizeSubgraph: (
    id: string,
    frame: { x: number; y: number; width: number; height: number },
    opts?: { recordHistory?: boolean },
  ) => void;
  addEdge: (
    source: string,
    target: string,
    handles?: { sourceHandle?: EdgeHandleId; targetHandle?: EdgeHandleId },
  ) => void;
  updateEdge: (id: string, patch: Partial<IREdge>, opts?: { recordHistory?: boolean }) => void;
  addSubgraph: (label?: string) => string;
  removeSubgraph: (id: string) => void;
  setSelection: (sel: Selection) => void;
  setSavePositions: (save: boolean) => void;
  autoLayout: () => void;
  recordHistorySnapshot: () => void;
  undo: () => void;
  redo: () => void;
}

export type EditorStoreApi = StoreApi<EditorState>;

const HISTORY_LIMIT = 100;

const cloneIR = (ir: MermaidIR): MermaidIR => ({
  direction: ir.direction,
  nodes: ir.nodes.map((n) => ({ ...n })),
  edges: ir.edges.map((e) => ({ ...e })),
  subgraphs: ir.subgraphs.map((s) => ({ ...s })),
  rawLines: [...ir.rawLines],
  positions: { ...ir.positions },
  subgraphFrames: { ...ir.subgraphFrames },
  savePositions: ir.savePositions,
});

const newNodeId = (existing: Iterable<string>): string => {
  const set = new Set(existing);
  for (let i = 1; i < 1_000_000; i++) {
    const id = `n${i}`;
    if (!set.has(id)) return id;
  }
  throw new Error("ID exhaustion");
};

const newEdgeId = (existing: Iterable<string>): string => {
  const set = new Set(existing);
  for (let i = 1; i < 1_000_000; i++) {
    const id = `e${i}`;
    if (!set.has(id)) return id;
  }
  throw new Error("ID exhaustion");
};

const newSubgraphId = (existing: Iterable<string>): string => {
  const set = new Set(existing);
  for (let i = 1; i < 1_000_000; i++) {
    const id = `sg_${i}`;
    if (!set.has(id)) return id;
  }
  throw new Error("ID exhaustion");
};

const fillMissingPositions = (ir: MermaidIR, prev: Positions): Positions => {
  const have = new Set(Object.keys(prev).filter((k) => ir.nodes.some((n) => n.id === k)));
  const need = ir.nodes.filter((n) => !have.has(n.id));
  if (need.length === 0) return { ...prev };
  const layouted = computeLayout(ir.nodes, ir.edges, ir.subgraphs, ir.direction);
  const out: Positions = {};
  for (const n of ir.nodes) {
    out[n.id] = prev[n.id] ?? layouted[n.id] ?? { x: 0, y: 0 };
  }
  return out;
};

const filterSubgraphFrames = (ir: MermaidIR, prev: SubgraphFrames): SubgraphFrames => {
  const valid = new Set(ir.subgraphs.map((s) => s.id));
  const out: SubgraphFrames = {};
  for (const [id, frame] of Object.entries(prev)) {
    if (valid.has(id)) out[id] = frame;
  }
  return out;
};

const descendantSubgraphIds = (subgraphs: IRSubgraph[], id: string): Set<string> => {
  const out = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const sg of subgraphs) {
      if (sg.parent && out.has(sg.parent) && !out.has(sg.id)) {
        out.add(sg.id);
        changed = true;
      }
    }
  }
  return out;
};

/**
 * Create a fresh editor store. Call this once per editor instance — each Obsidian
 * Modal / view / inline-block must own its own store so several blocks in the
 * same note do not share state (see plugin spec §6.3).
 */
export const createEditorStore = (): EditorStoreApi =>
  createStore<EditorState>()((set, get) => {
    const project = (ir: MermaidIR) => generateMermaid(ir);

    const commit = (
      nextIR: MermaidIR,
      options: {
        layout?: boolean;
        recordHistory?: boolean;
        positions?: Positions;
        subgraphFrames?: SubgraphFrames;
      } = {},
    ) => {
      const { recordHistory = true, layout = false } = options;
      const state = get();
      const prevPositions = options.positions ?? state.ir.positions;
      const merged: MermaidIR = { ...nextIR };
      merged.positions = layout
        ? computeLayout(merged.nodes, merged.edges, merged.subgraphs, merged.direction)
        : fillMissingPositions(merged, prevPositions);
      merged.subgraphFrames = filterSubgraphFrames(
        merged,
        options.subgraphFrames ?? state.ir.subgraphFrames,
      );
      const text = project(merged);
      set({
        ir: merged,
        text,
        status: { kind: "ok" },
        warnings: [],
        isTextDirty: false,
        past: recordHistory
          ? [...state.past, cloneIR(state.ir)].slice(-HISTORY_LIMIT)
          : state.past,
        future: recordHistory ? [] : state.future,
      });
    };

    const ensureTextCommitted = (): boolean => {
      if (!get().isTextDirty) return true;
      const { text } = get();
      const r = parseMermaid(text);
      if (!r.ok) {
        set({ status: { kind: "error", message: r.message, line: r.line } });
        return false;
      }
      commit(r.ir, { layout: false });
      set({ warnings: r.warnings });
      return true;
    };

    const initial = emptyIR();
    return {
      ir: initial,
      text: generateMermaid(initial),
      status: { kind: "ok" },
      warnings: [],
      isTextDirty: false,
      selection: { nodeIds: [], edgeIds: [] },
      past: [],
      future: [],

      setText: (text) => set({ text, isTextDirty: true }),

      commitText: () => {
        const { text } = get();
        const r = parseMermaid(text);
        if (!r.ok) {
          set({ status: { kind: "error", message: r.message, line: r.line } });
          return;
        }
        commit(r.ir, { layout: false });
        set({ warnings: r.warnings });
      },

      applyIR: (ir, opts = {}) => {
        commit(cloneIR(ir), { layout: opts.layout, recordHistory: opts.recordHistory ?? true });
      },

      setDirection: (d) => {
        if (!ensureTextCommitted()) return;
        const cur = get().ir;
        commit({ ...cloneIR(cur), direction: d }, { layout: true });
      },

      addNode: (shape, label) => {
        if (!ensureTextCommitted()) return "";
        const cur = cloneIR(get().ir);
        const id = newNodeId(cur.nodes.map((n) => n.id));
        cur.nodes.push({ id, shape, label: label ?? id, subgraph: null });
        const positions = { ...get().ir.positions };
        positions[id] = { x: 100 + cur.nodes.length * 12, y: 100 + cur.nodes.length * 12 };
        commit(cur, { positions });
        return id;
      },

      updateNode: (id, patch, opts) => {
        if (!ensureTextCommitted()) return;
        const recordHistory = opts?.recordHistory ?? true;
        const cur = cloneIR(get().ir);
        const node = cur.nodes.find((n) => n.id === id);
        if (!node) return;
        Object.assign(node, patch);
        commit(cur, { recordHistory });
      },

      removeSelection: (targets) => {
        if (!ensureTextCommitted()) return;
        const { selection, ir } = get();
        const nodeIds = targets ? targets.nodeIds : selection.nodeIds;
        const edgeIds = targets ? targets.edgeIds : selection.edgeIds;
        if (nodeIds.length === 0 && edgeIds.length === 0) return;
        const cur = cloneIR(ir);
        const removeNodes = new Set(nodeIds);
        const removeEdges = new Set(edgeIds);
        cur.nodes = cur.nodes.filter((n) => !removeNodes.has(n.id));
        cur.edges = cur.edges.filter(
          (e) => !removeEdges.has(e.id) && !removeNodes.has(e.source) && !removeNodes.has(e.target),
        );
        for (const id of removeNodes) delete cur.positions[id];
        commit(cur);
        const sel = get().selection;
        set({
          selection: {
            nodeIds: sel.nodeIds.filter((id) => !removeNodes.has(id)),
            edgeIds: sel.edgeIds.filter((id) => !removeEdges.has(id)),
          },
        });
      },

      setNodePosition: (id, pos) => {
        const cur = get().ir;
        const positions = { ...cur.positions, [id]: pos };
        const nextIR = { ...cur, positions };
        set({ ir: nextIR, text: project(nextIR) });
      },

      setNodePositions: (changes, opts) => {
        const cur = get().ir;
        const positions = { ...cur.positions };
        for (const c of changes) positions[c.id] = c.pos;
        if (opts?.recordHistory) {
          const nextIR = cloneIR(cur);
          nextIR.positions = positions;
          for (const update of opts.subgraphs ?? []) {
            const node = nextIR.nodes.find((n) => n.id === update.id);
            if (node) node.subgraph = update.subgraph;
          }
          commit(nextIR, { positions });
          return;
        }
        const nextIR = { ...cur, positions };
        set({ ir: nextIR, text: project(nextIR) });
      },

      moveSubgraph: (id, delta, frame, opts) => {
        const cur = get().ir;
        if (!cur.subgraphs.some((s) => s.id === id)) return;
        const subgraphIds = descendantSubgraphIds(cur.subgraphs, id);
        const positions = { ...cur.positions };
        for (const node of cur.nodes) {
          if (node.subgraph && subgraphIds.has(node.subgraph)) {
            const p = positions[node.id] ?? { x: 0, y: 0 };
            positions[node.id] = { x: p.x + delta.x, y: p.y + delta.y };
          }
        }
        const subgraphFrames = { ...cur.subgraphFrames, [id]: frame };
        for (const sg of cur.subgraphs) {
          if (sg.id === id || !subgraphIds.has(sg.id)) continue;
          const child = subgraphFrames[sg.id];
          if (child) {
            subgraphFrames[sg.id] = {
              ...child,
              x: child.x + delta.x,
              y: child.y + delta.y,
            };
          }
        }
        const nextIR = { ...cur, positions, subgraphFrames };
        if (opts?.recordHistory) {
          commit(cloneIR(nextIR), { positions, subgraphFrames });
          return;
        }
        set({ ir: nextIR, text: project(nextIR) });
      },

      resizeSubgraph: (id, frame, opts) => {
        const cur = get().ir;
        if (!cur.subgraphs.some((s) => s.id === id)) return;
        const subgraphFrames = { ...cur.subgraphFrames, [id]: frame };
        const nextIR = { ...cur, subgraphFrames };
        if (opts?.recordHistory) {
          commit(cloneIR(nextIR), { subgraphFrames });
          return;
        }
        set({ ir: nextIR, text: project(nextIR) });
      },

      addEdge: (source, target, handles) => {
        if (!ensureTextCommitted()) return;
        const cur = cloneIR(get().ir);
        if (!cur.nodes.some((n) => n.id === source) || !cur.nodes.some((n) => n.id === target))
          return;
        const id = newEdgeId(cur.edges.map((e) => e.id));
        cur.edges.push({
          id,
          source,
          target,
          style: "solid",
          head: "arrow",
          length: 2,
          ...handles,
        });
        commit(cur);
      },

      updateEdge: (id, patch, opts) => {
        if (!ensureTextCommitted()) return;
        const recordHistory = opts?.recordHistory ?? true;
        const cur = cloneIR(get().ir);
        const edge = cur.edges.find((e) => e.id === id);
        if (!edge) return;
        Object.assign(edge, patch);
        commit(cur, { recordHistory });
      },

      addSubgraph: (label) => {
        if (!ensureTextCommitted()) return "";
        const cur = cloneIR(get().ir);
        const id = newSubgraphId(cur.subgraphs.map((s) => s.id));
        const sg: IRSubgraph = { id, label: label ?? id, parent: null };
        cur.subgraphs.push(sg);
        const selectedNodeIds = new Set(get().selection.nodeIds);
        if (selectedNodeIds.size > 0) {
          for (const n of cur.nodes) {
            if (selectedNodeIds.has(n.id)) n.subgraph = id;
          }
        }
        commit(cur);
        return id;
      },

      removeSubgraph: (id) => {
        if (!ensureTextCommitted()) return;
        const cur = cloneIR(get().ir);
        cur.subgraphs = cur.subgraphs.filter((s) => s.id !== id);
        for (const n of cur.nodes) if (n.subgraph === id) n.subgraph = null;
        for (const s of cur.subgraphs) if (s.parent === id) s.parent = null;
        delete cur.subgraphFrames[id];
        commit(cur);
      },

      setSelection: (sel) => set({ selection: sel }),

      setSavePositions: (save) => {
        const cur = get().ir;
        const nextIR = { ...cur, savePositions: save };
        set({ ir: nextIR, text: project(nextIR) });
      },

      autoLayout: () => {
        if (!ensureTextCommitted()) return;
        const cur = cloneIR(get().ir);
        commit(cur, { layout: true });
      },

      recordHistorySnapshot: () => {
        const state = get();
        set({
          past: [...state.past, cloneIR(state.ir)].slice(-HISTORY_LIMIT),
          future: [],
        });
      },

      undo: () => {
        const { past, ir, future } = get();
        if (past.length === 0) return;
        const previous = past[past.length - 1];
        set({
          ir: previous,
          text: project(previous),
          status: { kind: "ok" },
          warnings: [],
          isTextDirty: false,
          past: past.slice(0, -1),
          future: [...future, cloneIR(ir)],
        });
      },

      redo: () => {
        const { past, ir, future } = get();
        if (future.length === 0) return;
        const next = future[future.length - 1];
        set({
          ir: next,
          text: project(next),
          status: { kind: "ok" },
          warnings: [],
          isTextDirty: false,
          past: [...past, cloneIR(ir)],
          future: future.slice(0, -1),
        });
      },
    };
  });
