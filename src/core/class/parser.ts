import type { ParseOutcome } from "../adapters/types";
import type {
  ClassDef,
  ClassDiagramIR,
  ClassDiagramItem,
  ClassMember,
  ClassNote,
  ClassRelation,
  Visibility,
} from "./ir-types";

/**
 * Parse a classDiagram Mermaid source into ClassDiagramIR.
 *
 * Supported constructs (Task 23/24):
 *   class ClassName
 *   class ClassName { <<annotation>>; +type member; +method() }
 *   ClassName : +type member   (inline member)
 *   ClassA <|-- ClassB
 *   ClassA "1" o-- "0..*" ClassB : label
 *   note "text"
 *   note for ClassName "text"
 *
 * All other non-blank lines are preserved verbatim as RawItem.
 * Implicit class defs (from inline members without a prior `class` declaration)
 * are inserted automatically so the generator always has explicit class nodes.
 */
export const parseClassDiagram = (source: string): ParseOutcome<ClassDiagramIR> => {
  const items: ClassDiagramItem[] = [];

  const stripped = source
    .replace(/^```\s*mermaid\s*\n/m, "")
    .replace(/\n```\s*$/m, "");
  const rawLines = stripped.split(/\r?\n/);

  // Skip optional YAML front matter (---...---) and find classDiagram header
  let headerIdx = -1;
  let inFrontMatter = false;
  for (let i = 0; i < rawLines.length; i++) {
    const t = rawLines[i].trim();
    if (!t) continue;
    if (t === "---") { inFrontMatter = !inFrontMatter; continue; }
    if (inFrontMatter) continue;
    if (/^%%/.test(t)) continue;
    if (/^classDiagram(?=\s|$)/.test(t)) { headerIdx = i; break; }
    return { ok: false, message: "Missing classDiagram declaration", line: i + 1 };
  }

  if (headerIdx === -1) {
    return { ok: false, message: "Missing classDiagram declaration", line: 0 };
  }

  // Track which class names have already been declared to avoid duplicate ClassDef items
  const classNamesSeen = new Set<string>();

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

    // --- Block class: `class Name {` ---
    const blockClassM = /^class\s+([A-Za-z_][\w]*)\s*(?:\[.*?\])?\s*\{/.exec(line);
    if (blockClassM) {
      const className = blockClassM[1];
      if (!classNamesSeen.has(className)) {
        classNamesSeen.add(className);
        items.push({ type: "class", name: className });
      }
      i++;
      while (i < rawLines.length) {
        const inner = rawLines[i].trim();
        if (/^\}/.test(inner)) { i++; break; }
        if (!inner) { i++; continue; }

        // Annotation: <<interface>> inside block
        const annoM = /^<<(.+)>>$/.exec(inner);
        if (annoM) {
          for (let j = items.length - 1; j >= 0; j--) {
            const it = items[j];
            if (it.type === "class" && it.name === className) {
              (it as ClassDef).annotation = annoM[1];
              break;
            }
          }
          i++;
          continue;
        }

        const member = parseMember(className, inner);
        if (member) {
          items.push(member);
        } else {
          items.push({ type: "raw", line: rawLines[i] });
        }
        i++;
      }
      continue;
    }

    // --- Simple class: `class Name` (no brace) ---
    const simpleClassM = /^class\s+([A-Za-z_][\w]*)(?:\s*\[.*?\])?\s*$/.exec(line);
    if (simpleClassM) {
      const className = simpleClassM[1];
      if (!classNamesSeen.has(className)) {
        classNamesSeen.add(className);
        items.push({ type: "class", name: className });
      }
      i++;
      continue;
    }

    // --- Note for class: `note for ClassName "text"` ---
    const noteForM = /^note\s+for\s+([A-Za-z_][\w]*)\s+"(.+)"/.exec(line);
    if (noteForM) {
      items.push({ type: "note", text: noteForM[2], forClass: noteForM[1] });
      i++;
      continue;
    }

    // --- Global note: `note "text"` ---
    const noteM = /^note\s+"(.+)"/.exec(line);
    if (noteM) {
      items.push({ type: "note", text: noteM[1] });
      i++;
      continue;
    }

    // --- Relation (try before inline member to catch labelled relations) ---
    const rel = parseRelation(line);
    if (rel) {
      items.push(rel);
      i++;
      continue;
    }

    // --- Inline member: `ClassName : member` or `ClassName: member` ---
    const inlineM = /^([A-Za-z_][\w]*)\s*:\s*(.+)$/.exec(line);
    if (inlineM) {
      const className = inlineM[1];
      if (!classNamesSeen.has(className)) {
        classNamesSeen.add(className);
        items.push({ type: "class", name: className });
      }
      const member = parseMember(className, inlineM[2].trim());
      if (member) {
        items.push(member);
      } else {
        items.push({ type: "raw", line: original });
      }
      i++;
      continue;
    }

    items.push({ type: "raw", line: original });
    i++;
  }

  return { ok: true, ir: { kind: "classDiagram", items }, warnings: [] };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parseMember = (className: string, text: string): ClassMember | null => {
  const m = /^([+\-#~]?)(.+)$/.exec(text);
  if (!m) return null;
  const visibility = m[1] as Visibility;
  const rest = m[2].trim();
  return {
    type: "member",
    className,
    visibility,
    text: rest,
    isMethod: rest.includes("("),
  };
};

const escRe = (s: string) => s.replace(/[-.*+?^${}()|[\]\\]/g, "\\$&");

// Order matters: more specific symbols first to avoid partial matches
const KNOWN_RELATIONS = [
  "<|--", "--|>",
  "<|..", "..|>",
  "*--", "--*",
  "o--", "--o",
  "-->", "<--",
  "..>", "<..",
  "--",
  "..",
] as const;

const CARD_OPT = '(?:"([^"]*)"\\s*)?';

const RELATION_RES: Array<{ sym: string; re: RegExp }> = KNOWN_RELATIONS.map((sym) => ({
  sym,
  re: new RegExp(
    `^([A-Za-z_]\\w*)\\s*${CARD_OPT}${escRe(sym)}\\s*${CARD_OPT}([A-Za-z_]\\w*)(?:\\s*:\\s*(.*))?$`,
  ),
}));

const parseRelation = (line: string): ClassRelation | null => {
  for (const { sym, re } of RELATION_RES) {
    const m = re.exec(line);
    if (m) {
      return {
        type: "relation",
        from: m[1],
        to: m[4],
        relation: sym,
        fromCardinality: m[2] || undefined,
        toCardinality: m[3] || undefined,
        label: m[5]?.trim() || undefined,
      };
    }
  }
  return null;
};
