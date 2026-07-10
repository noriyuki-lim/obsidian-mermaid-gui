import type { ParseOutcome } from "../adapters/types";
import type { XYAxis, XYChartIR, XYItem, XYOrientation } from "./ir-types";

/**
 * Parse an xychart-beta Mermaid source into XYChartIR.
 *
 * Supported constructs (MVP):
 *   xychart-beta [horizontal]
 *   title "<text>"     |  title <text>
 *   x-axis "<title>" <min> --> <max>
 *   x-axis <title> <min> --> <max>
 *   x-axis "<title>" [<cat>, ...]
 *   x-axis [<cat>, ...]
 *   y-axis "<title>"
 *   y-axis "<title>" <min> --> <max>
 *   bar  [<v>, ...]
 *   line [<v>, ...]
 *
 * Anything else is preserved as RawItem.
 */

// Recognizes only our own single-purpose orientation directive shape (the
// documented Mermaid alternative to the `xychart-beta horizontal` inline
// keyword). Anything else starting with `%%` before the header (other init
// keys, unrelated comments) is preserved verbatim via `leadingRawLines`
// instead of being silently dropped.
const ORIENTATION_INIT_RE =
  /^%%\{\s*init\s*:\s*\{\s*['"]xyChart['"]\s*:\s*\{\s*['"]chartOrientation['"]\s*:\s*['"](horizontal|vertical)['"]\s*\}\s*\}\s*\}%%\s*$/;

export const parseXYChart = (source: string): ParseOutcome<XYChartIR> => {
  const stripped = source
    .replace(/^```\s*mermaid\s*\n/m, "")
    .replace(/\n```\s*$/m, "");
  const rawLines = stripped.split(/\r?\n/);

  let headerIdx = -1;
  let orientationFromInit: XYOrientation | null = null;
  const leadingRawLines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i].trim();
    if (!t) continue;
    if (/^%%/.test(t)) {
      const m = ORIENTATION_INIT_RE.exec(t);
      if (m) {
        orientationFromInit = m[1] as XYOrientation;
      } else {
        leadingRawLines.push(rawLines[i]);
      }
      continue;
    }
    headerIdx = i;
    break;
  }

  if (headerIdx === -1 || !/^xychart-beta\b/.test(rawLines[headerIdx].trim())) {
    return {
      ok: false,
      message: "Missing xychart-beta declaration",
      line: headerIdx + 1,
    };
  }

  const headerLine = rawLines[headerIdx].trim();
  const orientation: XYOrientation = /\bhorizontal\b/.test(headerLine)
    ? "horizontal"
    : orientationFromInit ?? "vertical";

  const ir: XYChartIR = {
    kind: "xychart-beta",
    orientation,
    items: [],
    leadingRawLines,
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
      ir.title = unquote(m[1].trim());
      continue;
    }

    if ((m = /^x-axis\s+(.+)$/.exec(line))) {
      const axis = parseAxisDeclaration(m[1].trim());
      if (axis) {
        ir.xAxis = axis;
        continue;
      }
    }

    if ((m = /^y-axis\s+(.+)$/.exec(line))) {
      const axis = parseAxisDeclaration(m[1].trim());
      if (axis) {
        ir.yAxis = axis;
        continue;
      }
    }

    if ((m = /^(bar|line)\s*\[\s*(.*)\s*\]\s*(?:%%\s*gui:seriesTitle\s+(.*?)\s*)?$/.exec(line))) {
      const values = parseNumericList(m[2]);
      if (values) {
        const title = m[3]?.trim();
        ir.items.push({
          type: "series",
          series: m[1] as "bar" | "line",
          values,
          ...(title ? { title } : {}),
        });
        continue;
      }
    }

    ir.items.push({ type: "raw", line: original });
  }

  return { ok: true, ir, warnings: [] };
};

const unquote = (s: string): string => {
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(s);
  return m ? m[1] : s;
};

const parseAxisDeclaration = (rest: string): XYAxis | null => {
  // Categorical: `"title" [a, b, c]` | `title [a, b, c]` | `[a, b, c]`
  const cat = /^(?:"((?:[^"\\]|\\.)*)"\s+|(.+?)\s+)?\[\s*(.*?)\s*\]\s*$/.exec(rest);
  if (cat) {
    const title = cat[1] ?? cat[2]?.trim();
    const categories = parseCategoryList(cat[3]);
    return { kind: "categorical", title, categories };
  }

  // Numeric range: `"title" 0 --> 100` | `title 0 --> 100` | `0 --> 100`
  const num =
    /^(?:"((?:[^"\\]|\\.)*)"\s+|(.+?)\s+)?([+-]?\d+(?:\.\d+)?)\s*-->\s*([+-]?\d+(?:\.\d+)?)\s*$/.exec(rest);
  if (num) {
    const title = num[1] ?? num[2]?.trim();
    return { kind: "numeric", title, min: Number(num[3]), max: Number(num[4]) };
  }

  // Label only: `"title"` or bare title.
  const quoted = /^"((?:[^"\\]|\\.)*)"$/.exec(rest);
  if (quoted) return { kind: "label-only", title: quoted[1] };
  return { kind: "label-only", title: rest };
};

const parseCategoryList = (s: string): string[] => {
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;

    if (s[i] === '"') {
      i++;
      let val = "";
      while (i < s.length && s[i] !== '"') {
        if (s[i] === "\\" && i + 1 < s.length) {
          val += s[i + 1];
          i += 2;
          continue;
        }
        val += s[i];
        i++;
      }
      i++; // closing "
      out.push(val);
    } else {
      let val = "";
      while (i < s.length && s[i] !== ",") {
        val += s[i];
        i++;
      }
      out.push(val.trim());
    }

    while (i < s.length && (s[i] === "," || /\s/.test(s[i]))) i++;
  }
  return out;
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
