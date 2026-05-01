import { parseMermaid, type ParseOutcome } from "./parser";
import { generateMermaid } from "./generator";
import type { EdgeHandleId, MermaidIR, Positions, SubgraphFrames } from "./ir-types";

/**
 * Schema version for the `%% gui:meta` line. Bumping this lets future readers
 * know the on-disk format changed and gives us a place to hang migrations.
 */
export const GUI_VERSION = 2;

const POS_PREFIX = "%% gui:positions";
const SUBGRAPH_PREFIX = "%% gui:subgraphs";
const EDGES_PREFIX = "%% gui:edges";
const META_PREFIX = "%% gui:meta";
const FLOW_HEADER_RE = /^\s*(graph|flowchart)\s+(TD|TB|LR|RL|BT)\b/;

type EdgeHandleEntry = {
  sourceHandle?: EdgeHandleId;
  targetHandle?: EdgeHandleId;
};

interface DecodedBlock {
  parse: ParseOutcome;
  positions: Positions;
  subgraphFrames: SubgraphFrames;
  meta: { version: number; layout?: string; savePositions?: boolean } | null;
}

const tryParseJson = <T,>(raw: string): T | null => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const isGuiMetadataLine = (line: string): boolean => {
  const trimmed = line.trim();
  return (
    trimmed.startsWith(POS_PREFIX) ||
    trimmed.startsWith(SUBGRAPH_PREFIX) ||
    trimmed.startsWith(EDGES_PREFIX) ||
    trimmed.startsWith(META_PREFIX)
  );
};

const stripGuiMetadataLines = (source: string): string =>
  source
    .split(/\r?\n/)
    .filter((line) => !isGuiMetadataLine(line))
    .join("\n");

const trimBeforeFlowHeader = (source: string): string => {
  const lines = source.split(/\r?\n/);
  const headerIdx = lines.findIndex((line) => FLOW_HEADER_RE.test(line));
  return headerIdx >= 0 ? lines.slice(headerIdx).join("\n") : source;
};

const isEdgeHandleId = (value: unknown): value is EdgeHandleId =>
  value === "s-top" ||
  value === "s-right" ||
  value === "s-bottom" ||
  value === "s-left" ||
  value === "t-top" ||
  value === "t-right" ||
  value === "t-bottom" ||
  value === "t-left";

const normalizeEdgeHandleEntry = (value: unknown): EdgeHandleEntry | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const out: EdgeHandleEntry = {};
  if (isEdgeHandleId(raw.sourceHandle) && raw.sourceHandle.startsWith("s-")) {
    out.sourceHandle = raw.sourceHandle;
  }
  if (isEdgeHandleId(raw.targetHandle) && raw.targetHandle.startsWith("t-")) {
    out.targetHandle = raw.targetHandle;
  }
  return out.sourceHandle || out.targetHandle ? out : null;
};

/**
 * Parse a single mermaid code-block body. Pre-scans the source for
 * `%% gui:positions` / `%% gui:meta` comments emitted by a previous save and
 * strips them before handing the rest to the parser, so the codec works even
 * when the GUI comments live above the `flowchart` header (where the parser
 * treats them as part of leading whitespace and would otherwise drop them).
 *
 * The resulting IR has its `positions` populated from the comment; rawLines
 * contains only the lines the codec did not consume.
 */
export const decodeBlock = (source: string): DecodedBlock => {
  const positions: Positions = {};
  const subgraphFrames: SubgraphFrames = {};
  let edgeHandles: Array<EdgeHandleEntry | null> = [];
  let meta: DecodedBlock["meta"] = null;
  const cleaned: string[] = [];

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith(POS_PREFIX)) {
      const tail = trimmed.slice(POS_PREFIX.length).trim();
      const obj = tryParseJson<Record<string, [number, number] | { x: number; y: number }>>(tail);
      if (obj) {
        for (const [id, v] of Object.entries(obj)) {
          if (Array.isArray(v) && v.length === 2) positions[id] = { x: v[0], y: v[1] };
          else if (v && typeof v === "object" && "x" in v && "y" in v) {
            positions[id] = { x: Number(v.x), y: Number(v.y) };
          }
        }
      }
      continue;
    }
    if (trimmed.startsWith(SUBGRAPH_PREFIX)) {
      const tail = trimmed.slice(SUBGRAPH_PREFIX.length).trim();
      const obj = tryParseJson<
        Record<string, [number, number, number, number] | { x: number; y: number; width: number; height: number }>
      >(tail);
      if (obj) {
        for (const [id, v] of Object.entries(obj)) {
          if (Array.isArray(v) && v.length === 4) {
            subgraphFrames[id] = { x: v[0], y: v[1], width: v[2], height: v[3] };
          } else if (
            v &&
            typeof v === "object" &&
            "x" in v &&
            "y" in v &&
            "width" in v &&
            "height" in v
          ) {
            subgraphFrames[id] = {
              x: Number(v.x),
              y: Number(v.y),
              width: Number(v.width),
              height: Number(v.height),
            };
          }
        }
      }
      continue;
    }
    if (trimmed.startsWith(EDGES_PREFIX)) {
      const tail = trimmed.slice(EDGES_PREFIX.length).trim();
      const arr = tryParseJson<unknown[]>(tail);
      if (Array.isArray(arr)) {
        edgeHandles = arr.map((entry) => normalizeEdgeHandleEntry(entry));
      }
      continue;
    }
    if (trimmed.startsWith(META_PREFIX)) {
      const tail = trimmed.slice(META_PREFIX.length).trim();
      const obj = tryParseJson<{ version?: number; layout?: string; savePositions?: boolean }>(tail);
      if (obj && typeof obj.version === "number") {
        meta = { version: obj.version, layout: obj.layout, savePositions: obj.savePositions };
      }
      continue;
    }
    cleaned.push(line);
  }

  const parse = parseMermaid(cleaned.join("\n"));
  if (parse.ok) {
    parse.ir.positions = { ...parse.ir.positions, ...positions };
    parse.ir.subgraphFrames = { ...parse.ir.subgraphFrames, ...subgraphFrames };
    parse.ir.savePositions =
      typeof meta?.savePositions === "boolean"
        ? meta.savePositions
        : Object.keys(positions).length > 0;
    parse.ir.edges.forEach((edge, index) => {
      const handles = edgeHandles[index];
      if (!handles) return;
      if (handles.sourceHandle) edge.sourceHandle = handles.sourceHandle;
      if (handles.targetHandle) edge.targetHandle = handles.targetHandle;
    });
  }
  return { parse, positions, subgraphFrames, meta };
};

const formatPositions = (ir: MermaidIR): string => {
  const ids = ir.nodes.map((n) => n.id);
  const ordered: Record<string, [number, number]> = {};
  for (const id of ids) {
    const p = ir.positions[id];
    if (!p) continue;
    ordered[id] = [Math.round(p.x), Math.round(p.y)];
  }
  return JSON.stringify(ordered);
};

const formatMeta = (): string => JSON.stringify({ version: GUI_VERSION, layout: "dagre" });

const formatSubgraphFrames = (ir: MermaidIR): string | null => {
  const ids = new Set(ir.subgraphs.map((s) => s.id));
  const ordered: Record<string, [number, number, number, number]> = {};
  for (const id of ids) {
    const f = ir.subgraphFrames[id];
    if (!f) continue;
    ordered[id] = [
      Math.round(f.x),
      Math.round(f.y),
      Math.round(f.width),
      Math.round(f.height),
    ];
  }
  return Object.keys(ordered).length > 0 ? JSON.stringify(ordered) : null;
};

const formatMetaForIR = (ir: MermaidIR): string =>
  JSON.stringify({ version: GUI_VERSION, layout: "dagre", savePositions: ir.savePositions });

const formatEdgeHandles = (ir: MermaidIR): string | null => {
  const entries = ir.edges.map((edge) => {
    if (!edge.sourceHandle && !edge.targetHandle) return null;
    return {
      ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
    };
  });
  return entries.some(Boolean) ? JSON.stringify(entries) : null;
};

/**
 * Encode an IR back into the text that lives inside the ```mermaid fence.
 * Inserts the `%% gui:positions` / `%% gui:meta` comment lines just below the
 * `flowchart` header so the GUI metadata stays close to where readers expect
 * configuration in a Mermaid block.
 */
export const encodeBlock = (ir: MermaidIR): string => {
  const text = generateMermaid(ir);
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => FLOW_HEADER_RE.test(l));
  const edgeHandles = formatEdgeHandles(ir);
  const subgraphFrames = ir.savePositions ? formatSubgraphFrames(ir) : null;
  const insertion = [
    ...(ir.savePositions ? [`${POS_PREFIX} ${formatPositions(ir)}`] : []),
    ...(subgraphFrames ? [`${SUBGRAPH_PREFIX} ${subgraphFrames}`] : []),
    ...(edgeHandles ? [`${EDGES_PREFIX} ${edgeHandles}`] : []),
    `${META_PREFIX} ${formatMetaForIR(ir)}`,
  ];
  if (headerIdx === -1) {
    return [...insertion, ...lines].join("\n");
  }
  const out = [
    ...lines.slice(0, headerIdx + 1),
    ...insertion,
    ...lines.slice(headerIdx + 1),
  ];
  return out.join("\n");
};

export const stripGuiMetadata = (source: string): string => {
  const decoded = decodeBlock(source);
  if (!decoded.parse.ok) return trimBeforeFlowHeader(stripGuiMetadataLines(source));
  return generateMermaid(decoded.parse.ir);
};
