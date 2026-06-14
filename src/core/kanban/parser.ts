import type { ParseOutcome } from "../adapters/types";
import type { KanbanCard, KanbanColumn, KanbanIR, KanbanItem } from "./ir-types";

// `id[Text]` or `[Text]`, with an optional trailing `@{ ... }` metadata block.
const BRACKET_RE = /^([A-Za-z0-9_][\w-]*)?\[([^\]]*)\]\s*(@\{[^}]*\})?\s*$/;
// Bare token (no brackets): the whole line is the title/text, minus any meta.
const BARE_RE = /^(.+?)\s*(@\{[^}]*\})?\s*$/;

const leadingWidth = (line: string): number => {
  let n = 0;
  for (const ch of line) {
    if (ch === " ") n += 1;
    else if (ch === "\t") n += 4;
    else break;
  }
  return n;
};

interface ParsedToken {
  id?: string;
  text: string;
  bracketed: boolean;
  metaRaw?: string;
}

const parseToken = (trimmed: string): ParsedToken | null => {
  const b = trimmed.match(BRACKET_RE);
  if (b) {
    return { id: b[1] || undefined, text: b[2], bracketed: true, metaRaw: b[3] || undefined };
  }
  const bare = trimmed.match(BARE_RE);
  if (bare && bare[1].trim().length > 0) {
    return { text: bare[1].trim(), bracketed: false, metaRaw: bare[2] || undefined };
  }
  return null;
};

/**
 * Parse Mermaid `kanban` source. Columns are the shallowest indented lines
 * under the header; any line indented deeper than the established column indent
 * is a card of the current column. Unclassifiable lines are kept as raw so the
 * round-trip never drops user content.
 */
export function parseKanban(source: string): ParseOutcome<KanbanIR> {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const items: KanbanItem[] = [];
  let foundHeader = false;
  let columnIndent: number | null = null;
  let current: KanbanColumn | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!foundHeader) {
      if (/^kanban(?=\s|$)/.test(trimmed)) {
        foundHeader = true;
        continue;
      }
      if (!trimmed || trimmed.startsWith("%%")) continue;
      return { ok: false, message: "Missing kanban header", line: i + 1 };
    }

    if (!trimmed || trimmed.startsWith("%%")) {
      // Blank lines / comments live at top level; flush them as raw so spacing
      // and annotations survive a round-trip.
      current = null;
      items.push({ type: "raw", line: raw });
      continue;
    }

    const indent = leadingWidth(raw);
    const isCard = columnIndent !== null && current !== null && indent > columnIndent;

    if (isCard) {
      const tok = parseToken(trimmed);
      if (!tok) {
        items.push({ type: "raw", line: raw });
        continue;
      }
      const card: KanbanCard = {
        id: tok.id,
        text: tok.text,
        bracketed: tok.bracketed,
        metaRaw: tok.metaRaw,
      };
      current!.cards.push(card);
      continue;
    }

    // Column line: establishes (or re-confirms) the column indent.
    const tok = parseToken(trimmed);
    if (!tok) {
      current = null;
      items.push({ type: "raw", line: raw });
      continue;
    }
    if (columnIndent === null) columnIndent = indent;
    const column: KanbanColumn = {
      type: "column",
      id: tok.id,
      title: tok.text,
      bracketed: tok.bracketed,
      cards: [],
    };
    items.push(column);
    current = column;
  }

  if (!foundHeader) {
    return { ok: false, message: "Missing kanban header" };
  }

  return { ok: true, ir: { kind: "kanban", items }, warnings: [] };
}
