import dagre from "@dagrejs/dagre";
import type { Direction, IREdge, IRNode, IRSubgraph, Positions } from "./ir-types";

export interface NodeSize {
  width: number;
  height: number;
}

export const NODE_SIZE: NodeSize = { width: 160, height: 60 };

const dagreDir = (d: Direction): "TB" | "BT" | "LR" | "RL" => {
  if (d === "TD") return "TB";
  return d;
};

const SG_PREFIX = ":sg:";

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
  return out;
};
