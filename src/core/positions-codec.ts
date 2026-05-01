import { parseMermaid, type ParseOutcome } from "./parser";
import { generateMermaid } from "./generator";
import type { MermaidIR, Positions } from "./ir-types";

/**
 * Schema version for the `%% gui:meta` line. Bumping this lets future readers
 * know the on-disk format changed and gives us a place to hang migrations.
 */
export const GUI_VERSION = 1;

const POS_PREFIX = "%% gui:positions";
const META_PREFIX = "%% gui:meta";

interface DecodedBlock {
  parse: ParseOutcome;
  positions: Positions;
  meta: { version: number; layout?: string } | null;
}

const tryParseJson = <T,>(raw: string): T | null => {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
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
    if (trimmed.startsWith(META_PREFIX)) {
      const tail = trimmed.slice(META_PREFIX.length).trim();
      const obj = tryParseJson<{ version?: number; layout?: string }>(tail);
      if (obj && typeof obj.version === "number") {
        meta = { version: obj.version, layout: obj.layout };
      }
      continue;
    }
    cleaned.push(line);
  }

  const parse = parseMermaid(cleaned.join("\n"));
  if (parse.ok) {
    parse.ir.positions = { ...parse.ir.positions, ...positions };
  }
  return { parse, positions, meta };
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

/**
 * Encode an IR back into the text that lives inside the ```mermaid fence.
 * Inserts the `%% gui:positions` / `%% gui:meta` comment lines just below the
 * `flowchart` header so the GUI metadata stays close to where readers expect
 * configuration in a Mermaid block.
 */
export const encodeBlock = (ir: MermaidIR): string => {
  const text = generateMermaid(ir);
  const lines = text.split("\n");
  const headerIdx = lines.findIndex((l) => /^\s*(graph|flowchart)\s+(TD|TB|LR|RL|BT)\b/.test(l));
  const insertion = [`${POS_PREFIX} ${formatPositions(ir)}`, `${META_PREFIX} ${formatMeta()}`];
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
