import type { ParseOutcome } from "../adapters/types";
import type { MindmapIR, MindmapNode, MindmapNodeShape } from "./ir-types";

function getIndent(line: string): number {
  let count = 0;
  for (const ch of line) {
    if (ch === " ") count++;
    else if (ch === "\t") count += 2;
    else break;
  }
  return count;
}

const SHAPE_PATTERNS: Array<[RegExp, MindmapNodeShape]> = [
  [/^\(\((.+)\)\)$/, "circle"],
  [/^\)\)(.+)\(\($/, "bang"],
  [/^\)(.+)\($/, "cloud"],
  [/^\((.+)\)$/, "rounded"],
  [/^\[(.+)\]$/, "square"],
  [/^\{\{(.+)\}\}$/, "hexagon"],
];

function parseNodeText(trimmed: string): { text: string; shape: MindmapNodeShape } {
  for (const [re, shape] of SHAPE_PATTERNS) {
    const m = trimmed.match(re);
    if (m) return { text: m[1], shape };
  }
  return { text: trimmed, shape: "default" };
}

const ICON_RE = /^::icon\(([^)]+)\)\s*$/;

export function parseMindmap(source: string): ParseOutcome<MindmapIR> {
  try {
    const lines = source.replace(/\r\n/g, "\n").split("\n");
    let i = 0;
    let foundHeader = false;

    while (i < lines.length) {
      const trimmed = lines[i].trim();
      i++;
      if (!trimmed || trimmed.startsWith("%%")) continue;
      if (/^mindmap(\s|$)/.test(trimmed)) {
        foundHeader = true;
        break;
      }
      return { ok: false, message: "Missing mindmap header" };
    }

    if (!foundHeader) {
      return { ok: false, message: "Missing mindmap header" };
    }

    type Frame = { node: MindmapNode; indent: number };
    const stack: Frame[] = [];
    let root: MindmapNode | null = null;

    for (; i < lines.length; i++) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith("%%")) continue;

      const indent = getIndent(raw);

      // ::icon() — attach to most recent node in stack
      const iconMatch = trimmed.match(ICON_RE);
      if (iconMatch) {
        if (stack.length > 0) {
          stack[stack.length - 1].node.icon = iconMatch[1].trim();
        }
        continue;
      }

      const { text, shape } = parseNodeText(trimmed);
      const node: MindmapNode = { text, shape, children: [] };

      // pop frames at same or deeper indent
      while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }

      if (stack.length === 0) {
        root = node;
      } else {
        stack[stack.length - 1].node.children.push(node);
      }
      stack.push({ node, indent });
    }

    return { ok: true, ir: { kind: "mindmap", root }, warnings: [] };
  } catch (e) {
    return { ok: false, message: String(e) };
  }
}
