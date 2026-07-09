import type { Edge, Node } from "@xyflow/react";
import type {
  Direction,
  EdgeHandleId,
  FlowchartCurve,
  IREdge,
  IRNode,
  IRSubgraph,
  MermaidIR,
  Positions,
  SubgraphFrames,
} from "../core/ir-types";
import { NODE_SIZE } from "../core/dagre";

/* Bridge between IR and ReactFlow's node/edge model. */

// Approximates Mermaid's `flowchart.curve` with ReactFlow's built-in edge
// types. Edges here are fixed handle-to-handle (2-point) segments, so
// basis/natural/catmullRom-family curves all degenerate to the same geometry
// as a 2-point spline — the only visually distinct groups are "smooth",
// "straight" and "right-angle step", which the built-ins cover without a
// custom SVG path component. `"default"` (not `"bezier"`, which isn't a
// registered ReactFlow edge type key) renders as BezierEdge.
const CURVE_TO_FLOW_EDGE_TYPE: Record<FlowchartCurve, string> = {
  basis: "default",
  linear: "straight",
  step: "step",
  natural: "simplebezier",
};

const SG_PREFIX = ":sg:";
export const isSubgraphFlowId = (id: string): boolean => id.startsWith(SG_PREFIX);
export const subgraphIdFromFlowId = (id: string): string | null =>
  isSubgraphFlowId(id) ? id.slice(SG_PREFIX.length) : null;

export type FlowNodeData = {
  label: string;
  shape: IRNode["shape"];
  subgraph: string | null;
  color?: string;
  borderColor?: string;
};

export type SubgraphNodeData = {
  label: string;
  sgId: string;
  color?: string;
  borderColor?: string;
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

const handlePairForDirection = (
  direction: Direction,
): { sourceHandle: EdgeHandleId; targetHandle: EdgeHandleId } => {
  switch (direction) {
    case "LR":
      return { sourceHandle: "s-right", targetHandle: "t-left" };
    case "RL":
      return { sourceHandle: "s-left", targetHandle: "t-right" };
    case "BT":
      return { sourceHandle: "s-top", targetHandle: "t-bottom" };
    case "TD":
    case "TB":
    default:
      return { sourceHandle: "s-bottom", targetHandle: "t-top" };
  }
};

const endpointSubgraphChain = (
  id: string,
  nodesById: Map<string, IRNode>,
  subgraphsById: Map<string, IRSubgraph>,
): string[] => {
  const start = subgraphsById.has(id) ? id : nodesById.get(id)?.subgraph;
  const chain: string[] = [];
  let current = start ?? null;
  while (current) {
    chain.push(current);
    current = subgraphsById.get(current)?.parent ?? null;
  }
  return chain;
};

const edgeDirection = (edge: IREdge, ir: MermaidIR): Direction => {
  const nodesById = new Map(ir.nodes.map((n) => [n.id, n] as const));
  const subgraphsById = new Map(ir.subgraphs.map((sg) => [sg.id, sg] as const));
  const sourceChain = endpointSubgraphChain(edge.source, nodesById, subgraphsById);
  const targetChain = new Set(endpointSubgraphChain(edge.target, nodesById, subgraphsById));

  for (const sgId of sourceChain) {
    if (!targetChain.has(sgId)) continue;
    const direction = subgraphsById.get(sgId)?.direction;
    if (direction) return direction;
  }
  return ir.direction;
};

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
  frames: SubgraphFrames,
): Map<string, Bbox> => {
  const bboxes = new Map<string, Bbox>();
  if (subgraphs.length === 0) return bboxes;
  const depth = computeSgDepth(subgraphs);
  const ordered = [...subgraphs].sort(
    (a, b) => (depth.get(b.id) ?? 0) - (depth.get(a.id) ?? 0),
  );

  for (const sg of ordered) {
    const saved = frames[sg.id];
    if (saved) {
      bboxes.set(sg.id, {
        x: saved.x,
        y: saved.y,
        w: Math.max(SG_MIN_W, saved.width),
        h: Math.max(SG_MIN_H, saved.height),
      });
      continue;
    }
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
  const edgeType = CURVE_TO_FLOW_EDGE_TYPE[ir.curve];
  const bboxes = computeSubgraphBboxes(ir.nodes, ir.subgraphs, positions, ir.subgraphFrames);

  // Subgraph backdrop nodes — purely visual, render below regular nodes.
  // zIndex grows with depth so nested subgraphs paint above their parents
  // (otherwise the outer rectangle would swallow inner click/drag events).
  const sgDepth = computeSgDepth(ir.subgraphs);
  const sgNodes: FlowNode[] = ir.subgraphs.map((sg) => {
    const bb = bboxes.get(sg.id) ?? { x: 0, y: 0, w: SG_MIN_W, h: SG_MIN_H };
    const depth = sgDepth.get(sg.id) ?? 0;
    return {
      id: SG_PREFIX + sg.id,
      type: "subgraph" as const,
      position: { x: bb.x, y: bb.y },
      data: { label: sg.label ?? sg.id, sgId: sg.id, color: sg.color, borderColor: sg.borderColor },
      style: { width: bb.w, height: bb.h },
      draggable: true,
      selectable: true,
      deletable: true,
      focusable: true,
      zIndex: depth, // outer subgraphs at 0, deeper ones above
    };
  });

  const nodes: FlowNode[] = ir.nodes.map((n) => ({
    id: n.id,
    type: "shape" as const,
    position: positions[n.id] ?? { x: 0, y: 0 },
    // Seeds React Flow's internal `measured` size before the node's actual
    // DOM box is measured via ResizeObserver on mount. Without this, edges
    // on the very first render are routed against an unknown/zero size and
    // visibly snap into place once measurement completes a frame later —
    // the "misaligned until you press Auto-layout" bug (Auto-layout just
    // happens to commit a re-render after measurement has already settled).
    // .mge-shape-node is a fixed 160x60 box (styles.src.css), matching
    // NODE_SIZE used for Dagre layout, so this is always accurate up front.
    width: NODE_SIZE.width,
    height: NODE_SIZE.height,
    data: {
      label: n.label,
      shape: n.shape,
      subgraph: n.subgraph ?? null,
      color: n.color,
      borderColor: n.borderColor,
    },
    // Regular nodes sit above any subgraph backdrop, regardless of nesting depth.
    zIndex: 1000,
  }));

  // If an edge endpoint references a subgraph id (not a node id), route it to
  // the :sg: flow id so React Flow can resolve the handle on the backdrop.
  const sgIdSet = new Set(ir.subgraphs.map((s) => s.id));
  const routeEndpoint = (id: string): string => (sgIdSet.has(id) ? SG_PREFIX + id : id);

  const edges: FlowEdge[] = ir.edges.map((e) => {
    const handles = handlePairForDirection(edgeDirection(e, ir));
    return {
      id: e.id,
      source: routeEndpoint(e.source),
      target: routeEndpoint(e.target),
      sourceHandle: e.sourceHandle ?? handles.sourceHandle,
      targetHandle: e.targetHandle ?? handles.targetHandle,
      label: e.label,
      type: edgeType,
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
      zIndex: 2000,
    };
  });

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
