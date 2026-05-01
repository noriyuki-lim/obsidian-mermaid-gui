import {
  type Direction,
  type EdgeHead,
  type EdgeStyle,
  type IREdge,
  type IRNode,
  type IRSubgraph,
  type MermaidIR,
  type NodeShape,
  emptyIR,
} from "./ir-types";
import { SHAPE_BRACKETS } from "./shapes";

export interface ParseResult {
  ok: true;
  ir: MermaidIR;
  warnings: string[];
}
export interface ParseError {
  ok: false;
  message: string;
  line?: number;
}
export type ParseOutcome = ParseResult | ParseError;

/* -------------------------------------------------------------------------- */
/* low-level helpers                                                          */
/* -------------------------------------------------------------------------- */

const ID_RE = /^[A-Za-z0-9_][\w-]*/;
const DIRECTIONS: Direction[] = ["TD", "TB", "LR", "RL", "BT"];

const stripInlineComment = (s: string): string => {
  // Mermaid: `%%` starts a line comment. Don't strip inside quoted labels.
  let inQuote = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') inQuote = !inQuote;
    else if (!inQuote && c === "%" && s[i + 1] === "%") return s.slice(0, i);
  }
  return s;
};

const unquoteLabel = (raw: string): string => {
  const t = raw.trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length >= 2) {
    return t.slice(1, -1).replace(/\\"/g, '"');
  }
  return t;
};

/** Find index of `close` token in `s` starting at `start`, respecting "..." quoting. */
const findClose = (s: string, start: number, close: string): number => {
  let i = start;
  while (i < s.length) {
    if (s[i] === '"') {
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\") i++;
        i++;
      }
      i++;
      continue;
    }
    if (s.startsWith(close, i)) return i;
    i++;
  }
  return -1;
};

/* -------------------------------------------------------------------------- */
/* node-token parser                                                          */
/* -------------------------------------------------------------------------- */

interface ParsedNode {
  id: string;
  shape: NodeShape;
  label: string;
  /** True when an explicit shape bracket was seen (vs. bare reference). */
  explicit: boolean;
}

const parseNodeToken = (
  s: string,
  start: number,
): { node: ParsedNode; end: number } | null => {
  let i = start;
  while (i < s.length && /\s/.test(s[i])) i++;
  const m = ID_RE.exec(s.slice(i));
  if (!m) return null;
  const id = m[0];
  let j = i + id.length;

  for (const b of SHAPE_BRACKETS) {
    if (s.startsWith(b.open, j)) {
      const labelStart = j + b.open.length;
      const labelEnd = findClose(s, labelStart, b.close);
      if (labelEnd >= 0) {
        const label = unquoteLabel(s.slice(labelStart, labelEnd));
        return {
          node: { id, shape: b.shape, label, explicit: true },
          end: labelEnd + b.close.length,
        };
      }
    }
  }
  return { node: { id, shape: "rect", label: id, explicit: false }, end: j };
};

/* -------------------------------------------------------------------------- */
/* connector parser                                                           */
/* -------------------------------------------------------------------------- */

interface ParsedConn {
  style: EdgeStyle;
  head: EdgeHead;
  label?: string;
  length: number;
}

const parseConnector = (
  s: string,
  start: number,
): { conn: ParsedConn; end: number } | null => {
  const rest = s.slice(start);
  let m: RegExpExecArray | null;
  let style: EdgeStyle;
  let head: EdgeHead = "none";
  let label: string | undefined;
  let length = 0;
  let used = 0;

  // Order: dotted before solid (both share `-`), thick is unambiguous.
  if ((m = /^(={2,})\s+([^|]+?)\s+(={2,})(>?)/.exec(rest))) {
    style = "thick";
    label = m[2].trim();
    head = m[4] === ">" ? "arrow" : "none";
    length = m[1].length + m[3].length;
    used = m[0].length;
  } else if ((m = /^(={2,})(>?)/.exec(rest))) {
    style = "thick";
    head = m[2] === ">" ? "arrow" : "none";
    length = m[1].length;
    used = m[0].length;
  } else if ((m = /^(-\.+-?)\s+([^|]+?)\s+(-?\.+-)(>?)/.exec(rest))) {
    style = "dotted";
    label = m[2].trim();
    head = m[4] === ">" ? "arrow" : "none";
    length = m[1].length + m[3].length;
    used = m[0].length;
  } else if ((m = /^(-\.+-?)(>?)/.exec(rest))) {
    style = "dotted";
    head = m[2] === ">" ? "arrow" : "none";
    length = m[1].length;
    used = m[0].length;
  } else if ((m = /^(-{2,})\s+([^|]+?)\s+(-{2,})(>?)/.exec(rest))) {
    style = "solid";
    label = m[2].trim();
    head = m[4] === ">" ? "arrow" : "none";
    length = m[1].length + m[3].length;
    used = m[0].length;
  } else if ((m = /^(-{2,})(>?)/.exec(rest))) {
    style = "solid";
    head = m[2] === ">" ? "arrow" : "none";
    length = m[1].length;
    used = m[0].length;
  } else {
    return null;
  }

  // Optional `|label|` suffix.
  const tail = s.slice(start + used);
  const lm = /^\s*\|([^|]+)\|/.exec(tail);
  if (lm) {
    label = lm[1].trim();
    used += lm[0].length;
  }

  return { conn: { style, head, label, length }, end: start + used };
};

/* -------------------------------------------------------------------------- */
/* edge-chain parser                                                          */
/* -------------------------------------------------------------------------- */

interface EdgeChain {
  nodes: ParsedNode[];
  conns: ParsedConn[];
}

const parseEdgeChain = (line: string): EdgeChain | null => {
  const nodes: ParsedNode[] = [];
  const conns: ParsedConn[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    const np = parseNodeToken(line, i);
    if (!np) return null;
    nodes.push(np.node);
    i = np.end;
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    const cp = parseConnector(line, i);
    if (!cp) return null;
    conns.push(cp.conn);
    i = cp.end;
  }
  if (conns.length === 0) return null;
  if (nodes.length !== conns.length + 1) return null;
  return { nodes, conns };
};

/* -------------------------------------------------------------------------- */
/* top-level parser                                                           */
/* -------------------------------------------------------------------------- */

export const parseMermaid = (source: string): ParseOutcome => {
  const ir = emptyIR();
  const warnings: string[] = [];

  // Strip surrounding ```mermaid fences if present.
  const stripped = source.replace(/^```\s*mermaid\s*\n/m, "").replace(/\n```\s*$/m, "");
  const rawLines = stripped.split(/\r?\n/);

  // Find header: first non-blank, non-comment line.
  let headerIdx = -1;
  for (let i = 0; i < rawLines.length; i++) {
    const t = stripInlineComment(rawLines[i]).trim();
    if (t.length === 0) continue;
    headerIdx = i;
    break;
  }
  if (headerIdx === -1) {
    return { ok: true, ir, warnings: ["empty input"] };
  }
  const headerMatch = /^(?:graph|flowchart)\s+(TD|TB|LR|RL|BT)\b/.exec(
    stripInlineComment(rawLines[headerIdx]).trim(),
  );
  if (!headerMatch) {
    return {
      ok: false,
      message: "Missing or unsupported `graph`/`flowchart` declaration on the first non-empty line.",
      line: headerIdx + 1,
    };
  }
  ir.direction = headerMatch[1] as Direction;

  // Stack of currently open subgraphs.
  const sgStack: string[] = [];
  const nodeMap = new Map<string, IRNode>();
  const sgMap = new Map<string, IRSubgraph>();
  let edgeCounter = 0;

  const upsertNode = (np: ParsedNode): IRNode => {
    const existing = nodeMap.get(np.id);
    const parent = sgStack.length ? sgStack[sgStack.length - 1] : null;
    if (existing) {
      // Later explicit definition overrides shape/label.
      if (np.explicit) {
        existing.shape = np.shape;
        existing.label = np.label;
      }
      if (parent && existing.subgraph == null) existing.subgraph = parent;
      return existing;
    }
    const created: IRNode = {
      id: np.id,
      shape: np.shape,
      label: np.label,
      subgraph: parent,
    };
    nodeMap.set(np.id, created);
    ir.nodes.push(created);
    return created;
  };

  for (let li = headerIdx + 1; li < rawLines.length; li++) {
    const original = rawLines[li];
    const line = stripInlineComment(original).trim();
    if (!line) {
      if (original.includes("%%")) ir.rawLines.push(original);
      continue;
    }

    // subgraph open
    const sgOpen = /^subgraph\s+(.+)$/.exec(line);
    if (sgOpen) {
      const rest = sgOpen[1].trim();
      // Forms: `subgraph id`, `subgraph id [label]`, `subgraph "label"`
      let id: string;
      let label: string | undefined;
      const idLabel = /^([A-Za-z_][\w-]*)\s*\[(.+)\]\s*$/.exec(rest);
      const idOnly = /^([A-Za-z_][\w-]*)\s*$/.exec(rest);
      if (idLabel) {
        id = idLabel[1];
        label = unquoteLabel(idLabel[2]);
      } else if (idOnly) {
        id = idOnly[1];
      } else {
        // Anonymous label form — synthesize an id.
        id = `sg_${ir.subgraphs.length + 1}`;
        label = unquoteLabel(rest);
      }
      const parent = sgStack.length ? sgStack[sgStack.length - 1] : null;
      if (!sgMap.has(id)) {
        const sg: IRSubgraph = { id, label, parent };
        sgMap.set(id, sg);
        ir.subgraphs.push(sg);
      }
      sgStack.push(id);
      continue;
    }
    if (/^end\b/.test(line)) {
      sgStack.pop();
      continue;
    }

    // direction inside subgraph
    const dirMatch = /^direction\s+(TD|TB|LR|RL|BT)\b/.exec(line);
    if (dirMatch && sgStack.length > 0) {
      const sg = sgMap.get(sgStack[sgStack.length - 1]);
      if (sg) sg.direction = dirMatch[1] as Direction;
      continue;
    }

    // edge chain
    const chain = parseEdgeChain(line);
    if (chain) {
      const refs = chain.nodes.map((n) => upsertNode(n));
      for (let k = 0; k < chain.conns.length; k++) {
        const c = chain.conns[k];
        const src = refs[k];
        const dst = refs[k + 1];
        edgeCounter++;
        const edge: IREdge = {
          id: `e${edgeCounter}_${src.id}_${dst.id}`,
          source: src.id,
          target: dst.id,
          style: c.style,
          head: c.head,
          label: c.label,
          length: c.length,
        };
        ir.edges.push(edge);
      }
      continue;
    }

    // single node definition like `A[Apple]`
    const single = parseNodeToken(line, 0);
    if (single && single.end === line.length && single.node.explicit) {
      upsertNode(single.node);
      continue;
    }

    // Unknown statement — preserve verbatim so round-trip stays loss-free.
    ir.rawLines.push(original);
    warnings.push(`line ${li + 1}: kept as raw — not parsed`);
  }

  // Suppress directions/dummy validation: no side effects beyond ir population.
  void DIRECTIONS;

  return { ok: true, ir, warnings };
};
