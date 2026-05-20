import type { ParseOutcome } from "../adapters/types";
import type { SankeyIR, SankeyItem } from "./ir-types";

/**
 * Parse a sankey-beta Mermaid source into SankeyIR.
 *
 * Body is CSV with 3 columns (source, target, value). RFC 4180 quoting applies:
 *   "Field, with comma"   → literal comma inside the value
 *   "Field with "" quote" → literal double quote inside the value
 *
 * A literal `source,target,value` header row is optional; when present we
 * remember it so generate() can re-emit it. Comments (`%%`) and other unknown
 * lines are preserved verbatim as RawItem.
 */
export const parseSankey = (source: string): ParseOutcome<SankeyIR> => {
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

  if (headerIdx === -1 || !/^sankey-beta\b/.test(rawLines[headerIdx].trim())) {
    return {
      ok: false,
      message: "Missing sankey-beta declaration",
      line: headerIdx + 1,
    };
  }

  let hasHeaderRow = false;
  const items: SankeyItem[] = [];

  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const original = rawLines[i];
    const line = original.trim();

    if (!line) continue;

    if (/^%%/.test(line)) {
      items.push({ type: "raw", line: original });
      continue;
    }

    // Optional CSV header row `source,target,value` — only honour at first non-blank data line.
    if (
      !hasHeaderRow &&
      items.every((it) => it.type !== "link") &&
      /^source\s*,\s*target\s*,\s*value\s*$/i.test(line)
    ) {
      hasHeaderRow = true;
      continue;
    }

    const fields = parseCsvLine(line);
    if (fields && fields.length === 3) {
      const value = Number(fields[2]);
      if (Number.isFinite(value)) {
        items.push({ type: "link", source: fields[0], target: fields[1], value });
        continue;
      }
    }

    items.push({ type: "raw", line: original });
  }

  return {
    ok: true,
    ir: { kind: "sankey-beta", hasHeaderRow, items },
    warnings: [],
  };
};

/**
 * Parse one CSV line (RFC 4180 subset). Returns null on malformed input.
 */
const parseCsvLine = (line: string): string[] | null => {
  const out: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      // trailing empty field after a comma
      if (i > 0 && line[i - 1] === ",") out.push("");
      break;
    }

    let field = "";
    const ch = line[i];

    if (ch === '"') {
      i++;
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        if (line[i] === '"') {
          i++;
          break;
        }
        field += line[i];
        i++;
      }
    } else {
      while (i < line.length && line[i] !== ",") {
        field += line[i];
        i++;
      }
      field = field.trim();
    }

    out.push(field);

    if (i < line.length) {
      if (line[i] !== ",") return null;
      i++;
    } else {
      break;
    }
  }
  return out;
};
