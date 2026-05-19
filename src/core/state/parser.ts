import type { ParseOutcome } from "../adapters/types";
import type {
  NotePosition,
  StateDiagramIR,
  StateDiagramItem,
  StateNote,
} from "./ir-types";

/**
 * Parse a stateDiagram-v2 (or stateDiagram) Mermaid source into StateDiagramIR.
 *
 * Supported constructs (Task 28/29):
 *   [*] --> StateName
 *   StateA --> StateB
 *   StateA --> StateB : label
 *   state "description" as name
 *   state name <<fork|join|choice>>
 *   StateName : description text
 *   note right of State : text
 *   note right of State\n  multi-line text\n  end note
 *
 * Composite state blocks (state Name { ... }) are preserved verbatim as RawItems.
 * All other unrecognised lines are preserved as RawItems.
 */
export const parseStateDiagram = (source: string): ParseOutcome<StateDiagramIR> => {
  const items: StateDiagramItem[] = [];

  const stripped = source
    .replace(/^```\s*mermaid\s*\n/m, "")
    .replace(/\n```\s*$/m, "");
  const rawLines = stripped.split(/\r?\n/);

  // Find the stateDiagram header line
  let headerIdx = -1;
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i].trim();
    if (!t || /^%%/.test(t)) continue;
    if (/^stateDiagram(?:-v2)?(?=\s|$)/.test(t)) { headerIdx = i; break; }
    return { ok: false, message: "Missing stateDiagram declaration", line: i + 1 };
  }

  if (headerIdx === -1) {
    return { ok: false, message: "Missing stateDiagram declaration", line: 0 };
  }

  // State name: alphanumeric identifier OR [*]
  const STATE_NAME_RE = "[A-Za-z_][\\w]*|\\[\\*\\]";

  let i = headerIdx + 1;
  while (i < rawLines.length) {
    const original = rawLines[i];
    const line = original.trim();

    if (!line) { i++; continue; }

    if (/^%%/.test(line)) {
      items.push({ type: "raw", line: original });
      i++;
      continue;
    }

    // --- Composite state block: `state Name {` → collect as raw until `}` ---
    if (/^state\s+/.test(line) && /\{/.test(line)) {
      items.push({ type: "raw", line: original });
      i++;
      let depth = 1;
      while (i < rawLines.length && depth > 0) {
        const inner = rawLines[i];
        items.push({ type: "raw", line: inner });
        for (const ch of inner) {
          if (ch === "{") depth++;
          if (ch === "}") depth--;
        }
        i++;
      }
      continue;
    }

    // --- State declaration: `state "desc" as name` ---
    const stateDescM = /^state\s+"([^"]+)"\s+as\s+([A-Za-z_][\w]*)$/.exec(line);
    if (stateDescM) {
      items.push({ type: "state", name: stateDescM[2], description: stateDescM[1] });
      i++;
      continue;
    }

    // --- State annotation: `state name <<annotation>>` ---
    const stateAnnoM = /^state\s+([A-Za-z_][\w]*)\s+<<(.+)>>$/.exec(line);
    if (stateAnnoM) {
      items.push({ type: "state", name: stateAnnoM[1], annotation: stateAnnoM[2] });
      i++;
      continue;
    }

    // --- Multi-line note: `note right/left of State` (no colon text) ---
    const noteStartM = /^note\s+(right of|left of)\s+([A-Za-z_][\w]*)$/.exec(line);
    if (noteStartM) {
      const position = noteStartM[1] as NotePosition;
      const state = noteStartM[2];
      const textLines: string[] = [];
      i++;
      while (i < rawLines.length) {
        const inner = rawLines[i].trim();
        if (/^end note$/.test(inner)) { i++; break; }
        textLines.push(inner);
        i++;
      }
      items.push({ type: "note", position, state, text: textLines.join("\n").trim() });
      continue;
    }

    // --- Single-line note: `note right/left of State : text` ---
    const noteSingleM = /^note\s+(right of|left of)\s+([A-Za-z_][\w]*)\s*:\s*(.*)$/.exec(line);
    if (noteSingleM) {
      items.push({
        type: "note",
        position: noteSingleM[1] as NotePosition,
        state: noteSingleM[2],
        text: noteSingleM[3].trim(),
      });
      i++;
      continue;
    }

    // --- Transition: `StateA --> StateB` or `StateA --> StateB : label` ---
    const transM = new RegExp(
      `^(${STATE_NAME_RE})\\s*-->\\s*(${STATE_NAME_RE})(?:\\s*:\\s*(.*))?$`,
    ).exec(line);
    if (transM) {
      items.push({
        type: "transition",
        from: transM[1],
        to: transM[2],
        label: transM[3]?.trim() || undefined,
      });
      i++;
      continue;
    }

    // --- State description: `StateName : description` ---
    const stateDescLineM = /^([A-Za-z_][\w]*)\s*:\s*(.+)$/.exec(line);
    if (stateDescLineM) {
      items.push({ type: "state-desc", name: stateDescLineM[1], description: stateDescLineM[2].trim() });
      i++;
      continue;
    }

    items.push({ type: "raw", line: original });
    i++;
  }

  return { ok: true, ir: { kind: "stateDiagram-v2", items }, warnings: [] };
};
