import type { IREdge, IRNode, IRSubgraph, MermaidIR } from "./ir-types";
import { SHAPE_BY_KEY } from "./shapes";

const INDENT = "  ";

const needsQuoting = (label: string): boolean => {
  if (label.length === 0) return false;
  // Quote if it would clash with bracket parsing or has structural punctuation.
  return /[\[\](){}|<>"#%&\\\n]/.test(label) || /^\s|\s$/.test(label);
};

const quoteLabel = (label: string): string => {
  if (!needsQuoting(label)) return label;
  return `"${label.replace(/"/g, '\\"')}"`;
};

const renderNodeShape = (node: IRNode): string => {
  const b = SHAPE_BY_KEY[node.shape];
  return `${node.id}${b.open}${quoteLabel(node.label)}${b.close}`;
};

const renderConnector = (edge: IREdge): string => {
  // Re-use original length when stored; otherwise default to a minimum.
  const head = edge.head === "arrow" ? ">" : "";
  if (edge.style === "thick") {
    const eqs = "=".repeat(Math.max(2, Math.floor((edge.length || 2) / (edge.label ? 2 : 1))));
    if (edge.label) {
      return `${eqs} ${edge.label} ${eqs}${head}`;
    }
    return `${eqs}${head}`;
  }
  if (edge.style === "dotted") {
    if (edge.label) {
      return `-.- ${edge.label} -.-${head}`;
    }
    return `-.-${head}`;
  }
  // solid
  const dashes = "-".repeat(Math.max(2, Math.floor((edge.length || 2) / (edge.label ? 2 : 1))));
  if (edge.label) {
    return `${dashes} ${edge.label} ${dashes}${head}`;
  }
  return `${dashes}${head}`;
};

const renderEdge = (edge: IREdge): string =>
  `${edge.source} ${renderConnector(edge)} ${edge.target}`;

interface RenderOptions {
  /** When true, omit node definitions whose label equals id and shape is "rect". */
  inferBareNodes?: boolean;
}

const buildSubgraphTree = (subgraphs: IRSubgraph[]) => {
  const children = new Map<string | null, IRSubgraph[]>();
  for (const sg of subgraphs) {
    const key = sg.parent ?? null;
    const arr = children.get(key) ?? [];
    arr.push(sg);
    children.set(key, arr);
  }
  return children;
};

export const generateMermaid = (ir: MermaidIR, opts: RenderOptions = {}): string => {
  const inferBareNodes = opts.inferBareNodes ?? true;
  const lines: string[] = [];
  lines.push(`flowchart ${ir.direction}`);

  const nodeById = new Map(ir.nodes.map((n) => [n.id, n] as const));
  const sgById = new Map(ir.subgraphs.map((s) => [s.id, s] as const));
  const edgeNodeIds = new Set<string>();
  for (const e of ir.edges) {
    edgeNodeIds.add(e.source);
    edgeNodeIds.add(e.target);
  }

  const isBare = (n: IRNode) =>
    n.subgraph == null && n.shape === "rect" && n.label === n.id && edgeNodeIds.has(n.id);

  const renderStyle = (id: string, fill?: string, stroke?: string): string | null => {
    const parts: string[] = [];
    if (fill) parts.push(`fill:${fill}`);
    if (stroke) parts.push(`stroke:${stroke}`);
    if (parts.length === 0) return null;
    return `style ${id} ${parts.join(",")}`;
  };

  // Group nodes by subgraph.
  const nodesBySg = new Map<string | null, IRNode[]>();
  for (const n of ir.nodes) {
    const key = n.subgraph ?? null;
    const arr = nodesBySg.get(key) ?? [];
    arr.push(n);
    nodesBySg.set(key, arr);
  }

  const sgChildren = buildSubgraphTree(ir.subgraphs);

  const renderNodeDefs = (key: string | null, depth: number) => {
    const nodes = nodesBySg.get(key) ?? [];
    for (const n of nodes) {
      if (inferBareNodes && isBare(n)) continue;
      lines.push(INDENT.repeat(depth) + renderNodeShape(n));
    }
  };

  const renderSg = (sg: IRSubgraph, depth: number) => {
    const header = sg.label ? `subgraph ${sg.id} [${quoteLabel(sg.label)}]` : `subgraph ${sg.id}`;
    lines.push(INDENT.repeat(depth) + header);
    if (sg.direction) {
      lines.push(INDENT.repeat(depth + 1) + `direction ${sg.direction}`);
    }
    renderNodeDefs(sg.id, depth + 1);
    const kids = sgChildren.get(sg.id) ?? [];
    for (const child of kids) renderSg(child, depth + 1);
    lines.push(INDENT.repeat(depth) + "end");
  };

  // Top-level nodes first.
  renderNodeDefs(null, 1);
  // Top-level subgraphs.
  const topSgs = sgChildren.get(null) ?? [];
  for (const sg of topSgs) renderSg(sg, 1);

  // Edges (always at top level for stability). Endpoints may reference
  // a node id OR a subgraph id — both are valid edge targets in Mermaid.
  for (const e of ir.edges) {
    const srcOk = nodeById.has(e.source) || sgById.has(e.source);
    const dstOk = nodeById.has(e.target) || sgById.has(e.target);
    if (!srcOk || !dstOk) continue;
    lines.push(INDENT + renderEdge(e));
  }

  // Emit style directives for any node/subgraph carrying colors. Keep them
  // grouped at the bottom so the topology section stays readable.
  for (const n of ir.nodes) {
    const styleLine = renderStyle(n.id, n.color, n.borderColor);
    if (styleLine) lines.push(INDENT + styleLine);
  }
  for (const sg of ir.subgraphs) {
    const styleLine = renderStyle(sg.id, sg.color, sg.borderColor);
    if (styleLine) lines.push(INDENT + styleLine);
  }

  // Preserve raw lines that we couldn't parse.
  for (const r of ir.rawLines) {
    lines.push(r);
  }

  return lines.join("\n") + "\n";
};
