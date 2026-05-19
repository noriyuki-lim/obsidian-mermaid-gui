/** All Mermaid diagram types recognised by this plugin. */
export type DiagramKind =
  | "flowchart"
  | "sequenceDiagram"
  | "classDiagram"
  | "stateDiagram-v2"
  | "stateDiagram"
  | "pie"
  | "xychart-beta"
  | "sankey-beta"
  | "quadrantChart"
  | "radar-beta"
  | "gantt"
  | "timeline"
  | "erDiagram"
  | "mindmap"
  | "treemap-beta"
  | "venn-beta"
  | "journey"
  | "architecture-beta"
  | "block-beta"
  | "unknown";

const GUI_COMMENT_RE = /^\s*%%\s+gui:/;
const COMMENT_RE = /^\s*%%/;

// Ordered: more-specific patterns before shorter prefixes that could shadow them.
// `stateDiagram-v2` must precede `stateDiagram`.
const KIND_PATTERNS: Array<[RegExp, DiagramKind]> = [
  [/^(?:graph|flowchart)(?=\s)/, "flowchart"],
  [/^sequenceDiagram(?=\s|$)/, "sequenceDiagram"],
  [/^classDiagram(?=\s|$)/, "classDiagram"],
  [/^stateDiagram-v2(?=\s|$)/, "stateDiagram-v2"],
  [/^stateDiagram(?=\s|$)/, "stateDiagram"],
  [/^pie(?=\s|$)/, "pie"],
  [/^xychart-beta(?=\s|$)/, "xychart-beta"],
  [/^sankey-beta(?=\s|$)/, "sankey-beta"],
  [/^quadrantChart(?=\s|$)/, "quadrantChart"],
  [/^radar-beta(?=\s|$)/, "radar-beta"],
  [/^gantt(?=\s|$)/, "gantt"],
  [/^timeline(?=\s|$)/, "timeline"],
  [/^erDiagram(?=\s|$)/, "erDiagram"],
  [/^mindmap(?=\s|$)/, "mindmap"],
  [/^treemap-beta(?=\s|$)/, "treemap-beta"],
  [/^venn-beta(?=\s|$)/, "venn-beta"],
  [/^journey(?=\s|$)/, "journey"],
  [/^architecture-beta(?=\s|$)/, "architecture-beta"],
  [/^block-beta(?=\s|$)/, "block-beta"],
];

/**
 * Detect the diagram kind from raw Mermaid source.
 * Ignores blank lines, `%%` comments, and `%% gui:*` metadata comments,
 * then matches the first valid content line against known diagram keywords.
 */
export const detectDiagramKind = (source: string): DiagramKind => {
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || GUI_COMMENT_RE.test(trimmed) || COMMENT_RE.test(trimmed)) continue;
    for (const [re, kind] of KIND_PATTERNS) {
      if (re.test(trimmed)) return kind;
    }
    return "unknown";
  }
  return "unknown";
};

export const isFlowchart = (kind: DiagramKind): boolean => kind === "flowchart";
