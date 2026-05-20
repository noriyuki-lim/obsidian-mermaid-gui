import type { ParseOutcome } from "../adapters/types";
import type { RadarAxis, RadarCurve, RadarIR } from "./ir-types";

/**
 * Parse a radar-beta Mermaid source into RadarIR.
 *
 * Supported constructs (MVP):
 *   title <text>
 *   axis <id>["<label>"]              | axis <id1>, <id2>, ...
 *   curve <id>["<label>"]{<v>, ...}   | curve <id>{<v>, ...}
 *   showLegend true|false
 *   max <n>  /  min <n>  /  ticks <n>
 *   graticule circle|polygon
 *
 * `curve id{axis1: v, ...}` (key:value form) and other unknown lines go to rawLines.
 *
 * Note: Obsidian's bundled Mermaid does not render radar-beta. The GUI still
 * allows editing the source, but no preview is shown in Obsidian.
 */
export const parseRadar = (source: string): ParseOutcome<RadarIR> => {
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

  if (headerIdx === -1 || !/^radar-beta\b/.test(rawLines[headerIdx].trim())) {
    return {
      ok: false,
      message: "Missing radar-beta declaration",
      line: headerIdx + 1,
    };
  }

  const ir: RadarIR = {
    kind: "radar-beta",
    axes: [],
    curves: [],
    options: {},
    rawLines: [],
  };

  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const original = rawLines[i];
    const line = original.trim();

    if (!line) continue;

    if (/^%%/.test(line)) {
      ir.rawLines.push({ type: "raw", line: original });
      continue;
    }

    let m: RegExpMatchArray | null;

    if ((m = /^title\s+(.+)$/.exec(line))) {
      ir.title = m[1].trim();
      continue;
    }

    if (/^showLegend\b/.test(line)) {
      ir.options.showLegend = /^showLegend\s+true\b/.test(line);
      continue;
    }

    if ((m = /^max\s+([+-]?\d+(?:\.\d+)?)$/.exec(line))) {
      ir.options.max = Number(m[1]);
      continue;
    }
    if ((m = /^min\s+([+-]?\d+(?:\.\d+)?)$/.exec(line))) {
      ir.options.min = Number(m[1]);
      continue;
    }
    if ((m = /^ticks\s+(\d+)$/.exec(line))) {
      ir.options.ticks = Number(m[1]);
      continue;
    }
    if ((m = /^graticule\s+(circle|polygon)$/.exec(line))) {
      ir.options.graticule = m[1] as "circle" | "polygon";
      continue;
    }

    if (/^axis\s+/.test(line)) {
      const axes = parseAxisLine(line.replace(/^axis\s+/, ""));
      if (axes) {
        ir.axes.push(...axes);
        continue;
      }
    }

    if ((m = /^curve\s+(\S+?)(?:\["((?:[^"\\]|\\.)*)"\])?\s*\{\s*([^}]*)\s*\}\s*$/.exec(line))) {
      const id = m[1];
      const label = m[2];
      const values = parseNumericList(m[3]);
      if (values && !/[:]/.test(m[3])) {
        const curve: RadarCurve = { id, values };
        if (label !== undefined) curve.label = label;
        ir.curves.push(curve);
        continue;
      }
    }

    ir.rawLines.push({ type: "raw", line: original });
  }

  return { ok: true, ir, warnings: [] };
};

/**
 * Parse the body of an `axis` line into one or more RadarAxis entries.
 * Accepted forms (comma-separated):
 *   id              → { id }
 *   id["Label"]     → { id, label }
 */
const parseAxisLine = (rest: string): RadarAxis[] | null => {
  const out: RadarAxis[] = [];
  let i = 0;
  while (i < rest.length) {
    while (i < rest.length && /\s/.test(rest[i])) i++;
    if (i >= rest.length) break;

    const idMatch = /^([A-Za-z_][\w-]*)/.exec(rest.slice(i));
    if (!idMatch) return null;
    const id = idMatch[1];
    i += id.length;

    let label: string | undefined;
    if (rest[i] === "[") {
      const labelMatch = /^\[\s*"((?:[^"\\]|\\.)*)"\s*\]/.exec(rest.slice(i));
      if (!labelMatch) return null;
      label = labelMatch[1];
      i += labelMatch[0].length;
    }

    const entry: RadarAxis = label !== undefined ? { id, label } : { id };
    out.push(entry);

    while (i < rest.length && /[\s,]/.test(rest[i])) i++;
  }
  return out.length > 0 ? out : null;
};

const parseNumericList = (s: string): number[] | null => {
  if (s.trim().length === 0) return [];
  const out: number[] = [];
  for (const token of s.split(",")) {
    const n = Number(token.trim());
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
};
