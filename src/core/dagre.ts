import dagre from "@dagrejs/dagre";
import type { Direction, IREdge, IRNode, IRSubgraph, Positions } from "./ir-types";

export interface NodeSize {
  width: number;
  height: number;
}

export const NODE_SIZE: NodeSize = { width: 160, height: 60 };
const SG_PADDING = 24;
const SG_HEADER = 30;
const SG_MIN_W = 200;
const SG_MIN_H = 100;

const dagreDir = (d: Direction): "TB" | "BT" | "LR" | "RL" => {
  if (d === "TD") return "TB";
  return d;
};

const SG_PREFIX = ":sg:";

interface Bbox {
  x: number;
  y: number;
  width: number;
  height: number;
}

const layoutItems = (
  items: Array<{ id: string; width: number; height: number }>,
  edges: Array<{ id: string; source: string; target: string }>,
  direction: Direction,
): Positions => {
  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: dagreDir(direction),
    nodesep: 50,
    ranksep: 80,
    marginx: 0,
    marginy: 0,
  });

  for (const item of items) {
    g.setNode(item.id, { width: item.width, height: item.height });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target, {}, edge.id);
  }

  dagre.layout(g);

  const out: Positions = {};
  for (const item of items) {
    const r = g.node(item.id);
    if (r) out[item.id] = { x: r.x - item.width / 2, y: r.y - item.height / 2 };
  }
  return out;
};

const bboxForRects = (rects: Bbox[]): Bbox | null => {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
};

const subgraphDepths = (subgraphs: IRSubgraph[]): Map<string, number> => {
  const byId = new Map(subgraphs.map((s) => [s.id, s] as const));
  const memo = new Map<string, number>();
  const visit = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    const sg = byId.get(id);
    const depth = sg?.parent ? visit(sg.parent) + 1 : 0;
    memo.set(id, depth);
    return depth;
  };
  for (const sg of subgraphs) visit(sg.id);
  return memo;
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

const subgraphBbox = (
  sgId: string,
  nodes: IRNode[],
  subgraphs: IRSubgraph[],
  positions: Positions,
  size: NodeSize,
): Bbox => {
  const childSgIds = descendantSubgraphIds(subgraphs, sgId);
  const nodeRects = nodes
    .filter((n) => n.subgraph && childSgIds.has(n.subgraph))
    .map((n) => ({
      x: positions[n.id]?.x ?? 0,
      y: positions[n.id]?.y ?? 0,
      width: size.width,
      height: size.height,
    }));
  const bbox = bboxForRects(nodeRects);
  if (!bbox) return { x: 0, y: 0, width: SG_MIN_W, height: SG_MIN_H };
  return {
    x: bbox.x - SG_PADDING,
    y: bbox.y - SG_PADDING - SG_HEADER,
    width: Math.max(SG_MIN_W, bbox.width + SG_PADDING * 2),
    height: Math.max(SG_MIN_H, bbox.height + SG_PADDING * 2 + SG_HEADER),
  };
};

const shiftSubgraphContents = (
  sgId: string,
  delta: { x: number; y: number },
  nodes: IRNode[],
  subgraphs: IRSubgraph[],
  positions: Positions,
) => {
  const sgIds = descendantSubgraphIds(subgraphs, sgId);
  for (const node of nodes) {
    if (!node.subgraph || !sgIds.has(node.subgraph)) continue;
    const p = positions[node.id] ?? { x: 0, y: 0 };
    positions[node.id] = { x: p.x + delta.x, y: p.y + delta.y };
  }
};

const applySubgraphDirectionLayouts = (
  positions: Positions,
  nodes: IRNode[],
  edges: IREdge[],
  subgraphs: IRSubgraph[],
  size: NodeSize,
): Positions => {
  const directed = subgraphs.filter((sg) => sg.direction);
  if (directed.length === 0) return positions;

  const out: Positions = { ...positions };
  const depths = subgraphDepths(subgraphs);
  const ordered = [...directed].sort((a, b) => (depths.get(b.id) ?? 0) - (depths.get(a.id) ?? 0));

  for (const sg of ordered) {
    if (!sg.direction) continue;
    const directNodes = nodes.filter((n) => n.subgraph === sg.id);
    const childSubgraphs = subgraphs.filter((child) => child.parent === sg.id);
    const items = [
      ...directNodes.map((n) => ({ id: n.id, width: size.width, height: size.height })),
      ...childSubgraphs.map((child) => {
        const box = subgraphBbox(child.id, nodes, subgraphs, out, size);
        return { id: child.id, width: box.width, height: box.height };
      }),
    ];
    if (items.length <= 1) continue;

    const itemIds = new Set(items.map((item) => item.id));
    const localEdges = edges.filter((edge) => itemIds.has(edge.source) && itemIds.has(edge.target));
    const local = layoutItems(items, localEdges, sg.direction);

    const beforeRects = items.map((item) => {
      if (directNodes.some((node) => node.id === item.id)) {
        const p = out[item.id] ?? { x: 0, y: 0 };
        return { x: p.x, y: p.y, width: item.width, height: item.height };
      }
      return subgraphBbox(item.id, nodes, subgraphs, out, size);
    });
    const before = bboxForRects(beforeRects);
    const afterRects = items.map((item) => ({
      x: local[item.id]?.x ?? 0,
      y: local[item.id]?.y ?? 0,
      width: item.width,
      height: item.height,
    }));
    const after = bboxForRects(afterRects);
    if (!before || !after) continue;

    const offset = { x: before.x - after.x, y: before.y - after.y };
    for (const item of items) {
      const next = local[item.id];
      if (!next) continue;
      const nextTopLeft = { x: next.x + offset.x, y: next.y + offset.y };
      const directNode = directNodes.find((node) => node.id === item.id);
      if (directNode) {
        out[directNode.id] = nextTopLeft;
        continue;
      }
      const currentBox = subgraphBbox(item.id, nodes, subgraphs, out, size);
      shiftSubgraphContents(
        item.id,
        { x: nextTopLeft.x - currentBox.x, y: nextTopLeft.y - currentBox.y },
        nodes,
        subgraphs,
        out,
      );
    }
  }

  return out;
};

/**
 * Run dagre with compound (cluster) support so nodes that belong to the same
 * `subgraph` are laid out together. Returns absolute world-space positions
 * keyed by node id.
 */
export const computeLayout = (
  nodes: IRNode[],
  edges: IREdge[],
  subgraphs: IRSubgraph[],
  direction: Direction,
  size: NodeSize = NODE_SIZE,
): Positions => {
  const g = new dagre.graphlib.Graph({ multigraph: true, compound: true });
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: dagreDir(direction),
    nodesep: 50,
    ranksep: 80,
    marginx: 20,
    marginy: 20,
  });

  // Compound parents — empty nodes acting as cluster anchors.
  for (const sg of subgraphs) {
    g.setNode(SG_PREFIX + sg.id, {});
  }
  for (const sg of subgraphs) {
    if (sg.parent) g.setParent(SG_PREFIX + sg.id, SG_PREFIX + sg.parent);
  }

  for (const n of nodes) {
    g.setNode(n.id, { width: size.width, height: size.height });
    if (n.subgraph) g.setParent(n.id, SG_PREFIX + n.subgraph);
  }
  for (const e of edges) {
    g.setEdge(e.source, e.target, {}, e.id);
  }

  dagre.layout(g);

  const out: Positions = {};
  for (const n of nodes) {
    const r = g.node(n.id);
    if (r) {
      out[n.id] = { x: r.x - size.width / 2, y: r.y - size.height / 2 };
    }
  }
  return applySubgraphDirectionLayouts(out, nodes, edges, subgraphs, size);
};
