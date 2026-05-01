import type { Edge, Node } from "@xyflow/react";
import type {
  IREdge,
  IRNode,
  IRSubgraph,
  MermaidIR,
  Positions,
} from "../core/ir-types";
import { NODE_SIZE } from "../core/dagre";

/* Bridge between IR and ReactFlow's node/edge model. */

const SG_PREFIX = ":sg:";
export const isSubgraphFlowId = (id: string): boolean => id.startsWith(SG_PREFIX);

export type FlowNodeData = {
  label: string;
  shape: IRNode["shape"];
  subgraph: string | null;
};

export type SubgraphNodeData = {
  label: string;
  sgId: string;
};

export type FlowEdgeData = {
  style: IREdge["style"];
  head: IREdge["head"];
  length: number;
  customLabel?: string;
};

export type FlowNode =
  | Node<FlowNodeData, "shape">
  | Node<SubgraphNodeData, "subgraph">;
export type FlowEdge = Edge<FlowEdgeData>;

interface Bbox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const SG_PADDING = 24;
const SG_HEADER = 30;
const SG_MIN_W = 200;
const SG_MIN_H = 100;

const computeSgDepth = (subgraphs: IRSubgraph[]): Map<string, number> => {
  const byId = new Map(subgraphs.map((s) => [s.id, s] as const));
  const memo = new Map<string, number>();
  const visit = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    const sg = byId.get(id);
    const d = sg?.parent ? visit(sg.parent) + 1 : 0;
    memo.set(id, d);
    return d;
  };
  for (const s of subgraphs) visit(s.id);
  return memo;
};

/**
 * Compute absolute bounding boxes for every subgraph from current node
 * positions. Leaves (deepest subgraphs) are sized first so ancestors can wrap
 * their nested children correctly.
 */
const computeSubgraphBboxes = (
  nodes: IRNode[],
  subgraphs: IRSubgraph[],
  positions: Positions,
): Map<string, Bbox> => {
  const bboxes = new Map<string, Bbox>();
  if (subgraphs.length === 0) return bboxes;
  const depth = computeSgDepth(subgraphs);
  const ordered = [...subgraphs].sort(
    (a, b) => (depth.get(b.id) ?? 0) - (depth.get(a.id) ?? 0),
  );

  for (const sg of ordered) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const n of nodes) {
      if (n.subgraph !== sg.id) continue;
      const p = positions[n.id] ?? { x: 0, y: 0 };
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + NODE_SIZE.width);
      maxY = Math.max(maxY, p.y + NODE_SIZE.height);
    }
    for (const child of subgraphs) {
      if (child.parent !== sg.id) continue;
      const cb = bboxes.get(child.id);
      if (!cb) continue;
      minX = Math.min(minX, cb.x);
      minY = Math.min(minY, cb.y);
      maxX = Math.max(maxX, cb.x + cb.w);
      maxY = Math.max(maxY, cb.y + cb.h);
    }

    if (!isFinite(minX)) {
      bboxes.set(sg.id, { x: 0, y: 0, w: SG_MIN_W, h: SG_MIN_H });
      continue;
    }
    bboxes.set(sg.id, {
      x: minX - SG_PADDING,
      y: minY - SG_PADDING - SG_HEADER,
      w: Math.max(SG_MIN_W, maxX - minX + 2 * SG_PADDING),
      h: Math.max(SG_MIN_H, maxY - minY + 2 * SG_PADDING + SG_HEADER),
    });
  }
  return bboxes;
};

export const irToFlow = (
  ir: MermaidIR,
  positions: Positions,
): { nodes: FlowNode[]; edges: FlowEdge[] } => {
  const bboxes = computeSubgraphBboxes(ir.nodes, ir.subgraphs, positions);

  // Subgraph backdrop nodes — purely visual, render below regular nodes.
  const sgNodes: FlowNode[] = ir.subgraphs.map((sg) => {
    const bb = bboxes.get(sg.id) ?? { x: 0, y: 0, w: SG_MIN_W, h: SG_MIN_H };
    return {
      id: SG_PREFIX + sg.id,
      type: "subgraph" as const,
      position: { x: bb.x, y: bb.y },
      data: { label: sg.label ?? sg.id, sgId: sg.id },
      style: { width: bb.w, height: bb.h, zIndex: -1 },
      draggable: false,
      selectable: false,
      deletable: false,
      focusable: false,
      zIndex: 0,
    };
  });

  const nodes: FlowNode[] = ir.nodes.map((n) => ({
    id: n.id,
    type: "shape" as const,
    position: positions[n.id] ?? { x: 0, y: 0 },
    data: {
      label: n.label,
      shape: n.shape,
      subgraph: n.subgraph ?? null,
    },
    zIndex: 1,
  }));

  const edges: FlowEdge[] = ir.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    type: "smoothstep",
    animated: e.style === "dotted",
    style: {
      strokeWidth: e.style === "thick" ? 3 : 1.5,
      strokeDasharray: e.style === "dotted" ? "4 4" : undefined,
    },
    markerEnd: e.head === "arrow" ? "arrowclosed" : undefined,
    data: {
      style: e.style,
      head: e.head,
      length: e.length,
      customLabel: e.label,
    },
    zIndex: 2,
  }));

  // Backdrops first so nodes/edges layer on top.
  return { nodes: [...sgNodes, ...nodes], edges };
};

export const collectPositions = (nodes: FlowNode[]): Positions => {
  const out: Positions = {};
  for (const n of nodes) {
    if (isSubgraphFlowId(n.id)) continue;
    out[n.id] = { x: n.position.x, y: n.position.y };
  }
  return out;
};
