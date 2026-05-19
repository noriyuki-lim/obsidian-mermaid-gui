import type { ParseOutcome } from "../adapters/types";
import type { ArrowType, NotePosition, SequenceIR, SequenceItem } from "./ir-types";

/**
 * Parse a sequenceDiagram Mermaid source into SequenceIR.
 *
 * Supported constructs (Task 16):
 *   participant A / participant A as Label
 *   actor A / actor A as Label
 *   A->>B: text   (solid arrow)
 *   A-->>B: text  (dotted arrow)
 *   Note over A,B: text
 *   Note right of A: text
 *   Note left of A: text
 *   activate A / deactivate A
 *
 * All other non-blank lines are preserved verbatim as RawItem so round-trip
 * never drops content from the original source.
 */
export const parseSequence = (source: string): ParseOutcome<SequenceIR> => {
  const items: SequenceItem[] = [];

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

  if (headerIdx === -1 || !/^sequenceDiagram\b/.test(rawLines[headerIdx].trim())) {
    return {
      ok: false,
      message: "Missing sequenceDiagram declaration",
      line: headerIdx + 1,
    };
  }

  for (let i = headerIdx + 1; i < rawLines.length; i++) {
    const original = rawLines[i];
    const line = original.trim();

    if (!line) continue;

    if (/^%%/.test(line)) {
      items.push({ type: "raw", line: original });
      continue;
    }

    let m: RegExpMatchArray | null;

    // participant A as Label
    if ((m = /^participant\s+(\S+)\s+as\s+(.+)$/.exec(line))) {
      items.push({ type: "participant", alias: m[1], label: m[2].trim() });
      continue;
    }
    // participant A
    if ((m = /^participant\s+(\S+)\s*$/.exec(line))) {
      items.push({ type: "participant", alias: m[1] });
      continue;
    }

    // actor A as Label
    if ((m = /^actor\s+(\S+)\s+as\s+(.+)$/.exec(line))) {
      items.push({ type: "actor", alias: m[1], label: m[2].trim() });
      continue;
    }
    // actor A
    if ((m = /^actor\s+(\S+)\s*$/.exec(line))) {
      items.push({ type: "actor", alias: m[1] });
      continue;
    }

    // activate / deactivate
    if ((m = /^activate\s+(\S+)\s*$/.exec(line))) {
      items.push({ type: "activation", participant: m[1], active: true });
      continue;
    }
    if ((m = /^deactivate\s+(\S+)\s*$/.exec(line))) {
      items.push({ type: "activation", participant: m[1], active: false });
      continue;
    }

    // Note over/right of/left of <targets>: text
    if ((m = /^[Nn]ote\s+(over|right of|left of)\s+([^:]+):\s*(.*)$/.exec(line))) {
      const position = m[1] as NotePosition;
      const targets = m[2].split(",").map((s) => s.trim()).filter(Boolean);
      items.push({ type: "note", position, targets, text: m[3].trim() });
      continue;
    }

    // Message: from(-->>|->>) to: text
    // Non-greedy so participant aliases containing hyphens don't consume the arrow.
    if ((m = /^(.+?)\s*(-->>|->>)\s*(.+?)\s*:\s*(.*)$/.exec(line))) {
      const arrow: ArrowType = m[2] === "-->>" ? "dotted-arrow" : "solid-arrow";
      items.push({ type: "message", from: m[1].trim(), to: m[3].trim(), arrow, text: m[4] });
      continue;
    }

    items.push({ type: "raw", line: original });
  }

  return { ok: true, ir: { kind: "sequenceDiagram", items }, warnings: [] };
};
