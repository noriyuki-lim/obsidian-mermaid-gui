import type { ParseOutcome } from "../adapters/types";
import type { BlockIR, BlockItem } from "./ir-types";

const COLUMNS_RE = /^columns\s+(\d+|auto)\s*$/i;
// Single-block per line: id, id["label"], id["label"]:N, id:N
// Shape brackets captured for round-trip (no semantic interpretation).
const BLOCK_RE = /^([A-Za-z_][\w-]*)(\[\(|\(\(|\[|\(|>)?(?:"([^"]*)"|([^\]\)]*))?(\)\]|\)\)|\]|\))?(?::(\d+))?\s*$/;
const SPACE_RE = /^space(?::(\d+))?\s*$/;

export function parseBlock(source: string): ParseOutcome<BlockIR> {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const items: BlockItem[] = [];
  let foundHeader = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("%%")) continue;

    if (!foundHeader) {
      if (/^block-beta(\s|$)/.test(trimmed)) {
        foundHeader = true;
        continue;
      }
      return { ok: false, message: "Missing block-beta header", line: i + 1 };
    }

    const colMatch = trimmed.match(COLUMNS_RE);
    if (colMatch) {
      items.push({ type: "columns", count: colMatch[1] });
      continue;
    }

    const spaceMatch = trimmed.match(SPACE_RE);
    if (spaceMatch) {
      items.push({ type: "space", span: spaceMatch[1] ? parseInt(spaceMatch[1], 10) : undefined });
      continue;
    }

    // Skip multi-block lines (anything with whitespace between tokens that isn't a single id)
    // or nested block constructs — treat as raw to be safe.
    const hasNestedConstruct = /^block:|^end\b/.test(trimmed);
    if (hasNestedConstruct) {
      items.push({ type: "raw", line: raw });
      continue;
    }

    const m = trimmed.match(BLOCK_RE);
    if (m) {
      const id = m[1];
      const shapeOpen = m[2];
      const labelQuoted = m[3];
      const labelUnquoted = m[4];
      const shapeClose = m[5];
      const spanStr = m[6];
      const label = labelQuoted ?? (labelUnquoted && labelUnquoted.length > 0 ? labelUnquoted : undefined);
      items.push({
        type: "block",
        id,
        label,
        shapeOpen,
        shapeClose,
        span: spanStr ? parseInt(spanStr, 10) : undefined,
      });
      continue;
    }

    items.push({ type: "raw", line: raw });
  }

  if (!foundHeader) {
    return { ok: false, message: "Missing block-beta header" };
  }

  return { ok: true, ir: { kind: "block-beta", items }, warnings: [] };
}
