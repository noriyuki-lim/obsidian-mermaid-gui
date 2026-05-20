import type { ParseOutcome } from "../adapters/types";
import type { PieIR, PieItem } from "./ir-types";

/**
 * Parse a pie Mermaid source into PieIR.
 *
 * Supported header forms:
 *   pie
 *   pie showData
 *   pie title <text>
 *   pie showData title <text>
 *   pie title <text> showData
 *
 * `<text>` may optionally be wrapped in double quotes. Quotes are stripped from the IR.
 *
 * Supported data line:
 *   "label" : <number>
 *
 * Any other non-blank line (including `%%` comments and unknown directives) is
 * preserved verbatim as a RawItem so round-trip never drops content.
 */
export const parsePie = (source: string): ParseOutcome<PieIR> => {
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

  if (headerIdx === -1 || !/^pie\b/.test(rawLines[headerIdx].trim())) {
    return {
      ok: false,
      message: "Missing pie declaration",
      line: headerIdx + 1,
    };
  }

  const headerLine = rawLines[headerIdx].trim();
  const headerRest = headerLine.replace(/^pie\b/, "").trim();
  const { showData, title } = parsePieHeader(headerRest);

  const items: PieItem[] = [];

  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const original = rawLines[i];
    const line = original.trim();

    if (!line) continue;

    if (/^%%/.test(line)) {
      items.push({ type: "raw", line: original });
      continue;
    }

    // "label" : value
    const sliceMatch = /^"((?:[^"\\]|\\.)*)"\s*:\s*([+-]?\d+(?:\.\d+)?)\s*$/.exec(line);
    if (sliceMatch) {
      items.push({
        type: "slice",
        label: sliceMatch[1],
        value: Number(sliceMatch[2]),
      });
      continue;
    }

    items.push({ type: "raw", line: original });
  }

  return {
    ok: true,
    ir: { kind: "pie", showData, title, items },
    warnings: [],
  };
};

/**
 * Parse the portion of the header line that follows the `pie` keyword.
 * Recognises `showData` and `title <text>` in either order.
 * `<text>` may be quoted ("...") or bare (until end of line).
 */
const parsePieHeader = (rest: string): { showData: boolean; title?: string } => {
  let showData = false;
  let title: string | undefined;
  let cursor = rest;

  while (cursor.length > 0) {
    cursor = cursor.trim();
    if (cursor.length === 0) break;

    if (/^showData\b/.test(cursor)) {
      showData = true;
      cursor = cursor.replace(/^showData\b/, "");
      continue;
    }

    if (/^title\b/.test(cursor)) {
      cursor = cursor.replace(/^title\b/, "").trimStart();
      const quoted = /^"((?:[^"\\]|\\.)*)"/.exec(cursor);
      if (quoted) {
        title = quoted[1];
        cursor = cursor.slice(quoted[0].length);
      } else {
        // Bare title runs until next recognised keyword or end of string.
        const nextKeyword = /\s+showData\b/.exec(cursor);
        if (nextKeyword) {
          title = cursor.slice(0, nextKeyword.index).trim();
          cursor = cursor.slice(nextKeyword.index);
        } else {
          title = cursor.trim();
          cursor = "";
        }
      }
      continue;
    }

    // Unrecognised header fragment — stop consuming to avoid infinite loops.
    break;
  }

  return { showData, title };
};
