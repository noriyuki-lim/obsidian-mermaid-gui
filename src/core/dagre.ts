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
const EXTERNAL_SUBGRAPH_TARGET_GAP = 40;

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

const shiftExternalReachableNodes = (
  startId: string,
  delta: { x: number; y: number },
  nodes: IRNode[],
  edges: IREdge[],
  subgraphs: IRSubgraph[],
  positions: Positions,
) => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const descendantsBySubgraph = new Map(
    subgraphs.map((sg) => [sg.id, descendantSubgraphIds(subgraphs, sg.id)] as const),
  );
  const moved = new Set<string>();
  const queue = [startId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (moved.has(id) || !nodeIds.has(id)) continue;
    const p = positions[id];
    if (!p) continue;
    positions[id] = { x: p.x + delta.x, y: p.y + delta.y };
    moved.add(id);

    for (const edge of edges) {
      if (edge.source !== id) continue;
      if (nodeIds.has(edge.target)) {
        queue.push(edge.target);
        continue;
      }
      const sgIds = descendantsBySubgraph.get(edge.target);
      if (!sgIds) continue;
      for (const node of nodes) {
        if (node.subgraph && sgIds.has(node.subgraph)) queue.push(node.id);
      }
    }
  }
};

const compactExternalReachableRanks = (
  startId: string,
  nodes: IRNode[],
  edges: IREdge[],
  subgraphs: IRSubgraph[],
  positions: Positions,
  size: NodeSize,
) => {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const queue = [startId];
  const seen = new Set<string>();

  while (queue.length > 0) {
    const sourceId = queue.shift()!;
    if (seen.has(sourceId) || !nodeIds.has(sourceId)) continue;
    seen.add(sourceId);
    const source = positions[sourceId];
    if (!source) continue;

    for (const edge of edges) {
      if (edge.source !== sourceId || !nodeIds.has(edge.target)) continue;
      const target = positions[edge.target];
      if (!target) continue;
      const desiredTop = source.y + size.height + EXTERNAL_SUBGRAPH_TARGET_GAP;
      const deltaY = desiredTop - target.y;
      if (deltaY < 0) {
        shiftExternalReachableNodes(
          edge.target,
          { x: 0, y: deltaY },
          nodes,
          edges,
          subgraphs,
          positions,
        );
      }
      queue.push(edge.target);
    }
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

const compactExternalSubgraphEdges = (
  positions: Positions,
  nodes: IRNode[],
  edges: IREdge[],
  subgraphs: IRSubgraph[],
  direction: Direction,
  size: NodeSize,
): Positions => {
  if (direction !== "TD" && direction !== "TB") return positions;
  if (subgraphs.length === 0) return positions;

  const subgraphIds = new Set(subgraphs.map((sg) => sg.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
  const out: Positions = { ...positions };

  for (const sg of subgraphs) {
    if (!subgraphIds.has(sg.id)) continue;
    const targetDescendants = descendantSubgraphIds(subgraphs, sg.id);

    const incomingSourceBottoms = edges
      .filter((edge) => nodeIds.has(edge.source) && edge.target === sg.id)
      .map((edge) => {
        const source = nodesById.get(edge.source);
        if (!source) return null;
        if (source.subgraph && targetDescendants.has(source.subgraph)) return null;
        const p = out[source.id];
        return p ? p.y + size.height : null;
      })
      .filter((bottom): bottom is number => bottom !== null);

    if (incomingSourceBottoms.length > 0) {
      const box = subgraphBbox(sg.id, nodes, subgraphs, out, size);
      const desiredTop = Math.max(...incomingSourceBottoms) + EXTERNAL_SUBGRAPH_TARGET_GAP;
      const desiredCenterX = box.x + box.width / 2;
      const sourceCenters = edges
        .filter((edge) => nodeIds.has(edge.source) && edge.target === sg.id)
        .map((edge) => {
          const source = nodesById.get(edge.source);
          const p = out[edge.source];
          if (!source || !p) return null;
          if (source.subgraph && targetDescendants.has(source.subgraph)) return null;
          return { id: source.id, centerX: p.x + size.width / 2 };
        })
        .filter((source): source is { id: string; centerX: number } => source !== null);
      for (const source of sourceCenters) {
        const deltaX = desiredCenterX - source.centerX;
        if (deltaX !== 0) {
          const p = out[source.id];
          out[source.id] = { x: p.x + deltaX, y: p.y };
        }
      }

      const shiftedBox = subgraphBbox(sg.id, nodes, subgraphs, out, size);
      const deltaY = desiredTop - shiftedBox.y;
      if (deltaY < 0) {
        shiftSubgraphContents(sg.id, { x: 0, y: deltaY }, nodes, subgraphs, out);
      }
    }

    const outgoingTargets = edges
      .filter((edge) => edge.source === sg.id && nodeIds.has(edge.target))
      .map((edge) => {
        const target = nodesById.get(edge.target);
        if (!target) return null;
        if (target.subgraph && targetDescendants.has(target.subgraph)) return null;
        const p = out[target.id];
        return p ? { id: target.id, top: p.y } : null;
      })
      .filter((target): target is { id: string; top: number } => target !== null);

    if (outgoingTargets.length > 0) {
      const box = subgraphBbox(sg.id, nodes, subgraphs, out, size);
      const desiredTop = box.y + box.height + EXTERNAL_SUBGRAPH_TARGET_GAP;
      const desiredCenterX = box.x + box.width / 2;
      for (const target of outgoingTargets) {
        const p = out[target.id];
        const delta = {
          x: desiredCenterX - (p.x + size.width / 2),
          y: Math.min(0, desiredTop - target.top),
        };
        if (delta.x !== 0 || delta.y !== 0) {
          shiftExternalReachableNodes(target.id, delta, nodes, edges, subgraphs, out);
        }
        compactExternalReachableRanks(target.id, nodes, edges, subgraphs, out, size);
      }
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

  const sgIdSet = new Set(subgraphs.map((sg) => sg.id));
  const anchorId = (id: string): string => `${SG_PREFIX}${id}:anchor`;
  for (const sg of subgraphs) {
    g.setNode(anchorId(sg.id), { width: 1, height: 1 });
    g.setParent(anchorId(sg.id), SG_PREFIX + sg.id);
  }

  for (const n of nodes) {
    g.setNode(n.id, { width: size.width, height: size.height });
    if (n.subgraph) g.setParent(n.id, SG_PREFIX + n.subgraph);
  }
  const routeEndpoint = (id: string, role: "source" | "target"): string => {
    if (!sgIdSet.has(id)) return id;
    const sgIds = descendantSubgraphIds(subgraphs, id);
    const members = nodes.filter((n) => n.subgraph && sgIds.has(n.subgraph));
    if (members.length === 0) return anchorId(id);
    return role === "source" ? members[members.length - 1].id : members[0].id;
  };
  for (const e of edges) {
    g.setEdge(routeEndpoint(e.source, "source"), routeEndpoint(e.target, "target"), {}, e.id);
  }

  dagre.layout(g);

  const out: Positions = {};
  for (const n of nodes) {
    const r = g.node(n.id);
    if (r) {
      out[n.id] = { x: r.x - size.width / 2, y: r.y - size.height / 2 };
    }
  }
  const withSubgraphDirections = applySubgraphDirectionLayouts(out, nodes, edges, subgraphs, size);
  return compactExternalSubgraphEdges(
    withSubgraphDirections,
    nodes,
    edges,
    subgraphs,
    direction,
    size,
  );
};
