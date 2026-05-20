import type { ParseOutcome } from "../adapters/types";
import type { QuadrantIR, QuadrantItem } from "./ir-types";

/**
 * Parse a quadrantChart Mermaid source into QuadrantIR.
 *
 * Supported constructs (MVP):
 *   title <text>
 *   x-axis <left> --> <right>     |  x-axis <left>
 *   y-axis <bottom> --> <top>     |  y-axis <bottom>
 *   quadrant-1 <text> ... quadrant-4 <text>
 *   <Name>: [<x>, <y>]
 *
 * Anything else (point styling, classDef, ::: class, etc.) is preserved as RawItem.
 */
export const parseQuadrant = (source: string): ParseOutcome<QuadrantIR> => {
  const stripped = source
    .replace(/^```\s*mermaid\s*\n/m, "")
    .replace(/\n```\s*$/m, "");
  const rawLines = stripped.split(/\r?\n/);

  let headerIdx = -1;
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i].trim();
    if (!t || /^%%/.test(t)) continue;
    headerIdx = i;
    break;
  }

  if (headerIdx === -1 || !/^quadrantChart\b/.test(rawLines[headerIdx].trim())) {
    return {
      ok: false,
      message: "Missing quadrantChart declaration",
      line: headerIdx + 1,
    };
  }

  const ir: QuadrantIR = {
    kind: "quadrantChart",
    quadrants: {},
    items: [],
  };

  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const original = rawLines[i];
    const line = original.trim();

    if (!line) continue;

    if (/^%%/.test(line)) {
      ir.items.push({ type: "raw", line: original });
      continue;
    }

    let m: RegExpMatchArray | null;

    if ((m = /^title\s+(.+)$/.exec(line))) {
      ir.title = m[1].trim();
      continue;
    }

    if ((m = /^x-axis\s+(.+?)\s*-->\s*(.+)$/.exec(line))) {
      ir.xAxis = { left: m[1].trim(), right: m[2].trim() };
      continue;
    }
    if ((m = /^x-axis\s+(.+)$/.exec(line))) {
      ir.xAxis = { left: m[1].trim() };
      continue;
    }

    if ((m = /^y-axis\s+(.+?)\s*-->\s*(.+)$/.exec(line))) {
      ir.yAxis = { bottom: m[1].trim(), top: m[2].trim() };
      continue;
    }
    if ((m = /^y-axis\s+(.+)$/.exec(line))) {
      ir.yAxis = { bottom: m[1].trim() };
      continue;
    }

    if ((m = /^quadrant-([1-4])\s+(.+)$/.exec(line))) {
      const key = (`q${m[1]}` as const) as keyof QuadrantIR["quadrants"];
      ir.quadrants[key] = m[2].trim();
      continue;
    }

    // Point: `Name: [x, y]` — but reject lines that contain `:::className` (class-bound styling)
    // or trailing styling after `]` (e.g. `radius: 12`). Those go to rawLines.
    if (!/:::/.test(line)) {
      const point = /^([^:]+?)\s*:\s*\[\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*\]\s*$/.exec(line);
      if (point) {
        ir.items.push({
          type: "point",
          name: point[1].trim(),
          x: Number(point[2]),
          y: Number(point[3]),
        });
        continue;
      }
    }

    ir.items.push({ type: "raw", line: original });
  }

  return { ok: true, ir, warnings: [] };
};

type QuadrantKey = keyof QuadrantIR["quadrants"];
// Re-export for clarity; not currently consumed externally but keeps types stable.
export type { QuadrantKey };
