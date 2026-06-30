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

interface ContainerLayout {
  width: number;
  height: number;
  nodeOffsets: Positions;
}

const layoutAsBoxes = (
  nodes: IRNode[],
  edges: IREdge[],
  subgraphs: IRSubgraph[],
  direction: Direction,
  size: NodeSize,
): Positions => {
  const nodesById = new Map(nodes.map((node) => [node.id, node] as const));
  const subgraphsById = new Map(subgraphs.map((sg) => [sg.id, sg] as const));
  const childSubgraphs = new Map<string | null, IRSubgraph[]>();
  for (const sg of subgraphs) {
    const key = sg.parent ?? null;
    childSubgraphs.set(key, [...(childSubgraphs.get(key) ?? []), sg]);
  }

  const directChildForEndpoint = (
    endpointId: string,
    containerId: string | null,
    directNodeIds: Set<string>,
    directSubgraphIds: Set<string>,
  ): string | null => {
    if (directNodeIds.has(endpointId) || directSubgraphIds.has(endpointId)) return endpointId;

    const node = nodesById.get(endpointId);
    let sgId = node?.subgraph ?? (subgraphsById.has(endpointId) ? endpointId : null);
    while (sgId) {
      const sg = subgraphsById.get(sgId);
      if (!sg) return null;
      if ((sg.parent ?? null) === containerId) return sg.id;
      sgId = sg.parent ?? null;
    }
    return null;
  };

  const layoutContainer = (containerId: string | null): ContainerLayout => {
    const directNodes = nodes.filter((node) => (node.subgraph ?? null) === containerId);
    const directSubgraphs = childSubgraphs.get(containerId) ?? [];
    const childLayouts = new Map(
      directSubgraphs.map((sg) => [sg.id, layoutContainer(sg.id)] as const),
    );
    const items = [
      ...directNodes.map((node) => ({ id: node.id, width: size.width, height: size.height })),
      ...directSubgraphs.map((sg) => {
        const layout = childLayouts.get(sg.id)!;
        return { id: sg.id, width: layout.width, height: layout.height };
      }),
    ];
    if (items.length === 0) {
      return { width: SG_MIN_W, height: SG_MIN_H, nodeOffsets: {} };
    }

    const directNodeIds = new Set(directNodes.map((node) => node.id));
    const directSubgraphIds = new Set(directSubgraphs.map((sg) => sg.id));
    const itemIds = new Set(items.map((item) => item.id));
    const localEdges = edges
      .map((edge) => ({
        id: edge.id,
        source: directChildForEndpoint(edge.source, containerId, directNodeIds, directSubgraphIds),
        target: directChildForEndpoint(edge.target, containerId, directNodeIds, directSubgraphIds),
      }))
      .filter(
        (edge): edge is { id: string; source: string; target: string } =>
          !!edge.source &&
          !!edge.target &&
          edge.source !== edge.target &&
          itemIds.has(edge.source) &&
          itemIds.has(edge.target),
      );

    const containerDirection = containerId
      ? subgraphsById.get(containerId)?.direction ?? direction
      : direction;
    const itemPositions = layoutItems(items, localEdges, containerDirection);
    const contentBox =
      bboxForRects(
        items.map((item) => {
          const p = itemPositions[item.id] ?? { x: 0, y: 0 };
          return { x: p.x, y: p.y, width: item.width, height: item.height };
        }),
      ) ?? { x: 0, y: 0, width: 0, height: 0 };

    const isRoot = containerId === null;
    const box = isRoot
      ? contentBox
      : {
          x: contentBox.x - SG_PADDING,
          y: contentBox.y - SG_PADDING - SG_HEADER,
          width: Math.max(SG_MIN_W, contentBox.width + SG_PADDING * 2),
          height: Math.max(SG_MIN_H, contentBox.height + SG_PADDING * 2 + SG_HEADER),
        };

    const nodeOffsets: Positions = {};
    for (const node of directNodes) {
      const p = itemPositions[node.id] ?? { x: 0, y: 0 };
      nodeOffsets[node.id] = { x: p.x - box.x, y: p.y - box.y };
    }
    for (const sg of directSubgraphs) {
      const child = childLayouts.get(sg.id)!;
      const p = itemPositions[sg.id] ?? { x: 0, y: 0 };
      const childOrigin = { x: p.x - box.x, y: p.y - box.y };
      for (const [nodeId, offset] of Object.entries(child.nodeOffsets)) {
        nodeOffsets[nodeId] = { x: childOrigin.x + offset.x, y: childOrigin.y + offset.y };
      }
    }

    return { width: box.width, height: box.height, nodeOffsets };
  };

  return layoutContainer(null).nodeOffsets;
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
  return layoutAsBoxes(nodes, edges, subgraphs, direction, size);
};
