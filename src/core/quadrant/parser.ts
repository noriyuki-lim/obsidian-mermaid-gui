import type { ParseOutcome } from "../adapters/types";
import type { QuadrantIR, QuadrantItem } from "./ir-types";

// Mermaid accepts quoted or bare text for these fields (`title "Foo"` and
// `title Foo` are equivalent). We normalise to the unquoted form in the IR so
// the GUI's text inputs and preview don't show literal quote characters.
const stripQuotes = (s: string): string => {
  const t = s.trim();
  if (t.length >= 2) {
    const first = t[0];
    const last = t[t.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return t.slice(1, -1);
    }
  }
  return t;
};

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
      ir.title = stripQuotes(m[1]);
      continue;
    }

    if ((m = /^x-axis\s+(.+?)\s*-->\s*(.+)$/.exec(line))) {
      ir.xAxis = { left: stripQuotes(m[1]), right: stripQuotes(m[2]) };
      continue;
    }
    if ((m = /^x-axis\s+(.+)$/.exec(line))) {
      ir.xAxis = { left: stripQuotes(m[1]) };
      continue;
    }

    if ((m = /^y-axis\s+(.+?)\s*-->\s*(.+)$/.exec(line))) {
      ir.yAxis = { bottom: stripQuotes(m[1]), top: stripQuotes(m[2]) };
      continue;
    }
    if ((m = /^y-axis\s+(.+)$/.exec(line))) {
      ir.yAxis = { bottom: stripQuotes(m[1]) };
      continue;
    }

    if ((m = /^quadrant-([1-4])\s+(.+)$/.exec(line))) {
      const key = (`q${m[1]}` as const) as keyof QuadrantIR["quadrants"];
      ir.quadrants[key] = stripQuotes(m[2]);
      continue;
    }

    // Point: `Name: [x, y]` — but reject lines that contain `:::className` (class-bound styling)
    // or trailing styling after `]` (e.g. `radius: 12`). Those go to rawLines.
    if (!/:::/.test(line)) {
      const point = /^([^:]+?)\s*:\s*\[\s*([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)\s*\]\s*$/.exec(line);
      if (point) {
        ir.items.push({
          type: "point",
          name: stripQuotes(point[1]),
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
