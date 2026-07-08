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
  | "kanban"
  | "unknown";

const GUI_COMMENT_RE = /^\s*%%\s+gui:/;
const COMMENT_RE = /^\s*%%/;

// Mermaid's generic `---\n...\n---` frontmatter block can precede any
// diagram kind, but only kanban's parser currently understands it
// (`src/core/kanban/frontmatter.ts`). Special-casing detection here — rather
// than teaching the main loop below to skip frontmatter for every kind —
// keeps every other kind's fallback-to-"unknown" behaviour unchanged: their
// own parsers would otherwise receive a leading frontmatter block they can't
// read and seed an *empty* diagram (every editor's `seed()` does this on
// parse failure), risking silent data loss on save. Falling back to
// SourceOnlyEditor for a frontmatter'd diagram of an unsupported kind is the
// safe behaviour, so it stays that way.
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

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
  [/^kanban(?=\s|$)/, "kanban"],
];

/**
 * Detect the diagram kind from raw Mermaid source.
 * Ignores blank lines, `%%` comments, and `%% gui:*` metadata comments,
 * then matches the first valid content line against known diagram keywords.
 */
export const detectDiagramKind = (source: string): DiagramKind => {
  const fm = source.match(FRONTMATTER_RE);
  if (fm) {
    const rest = source.slice(fm[0].length).trimStart();
    return /^kanban(?=\s|$)/.test(rest) ? "kanban" : "unknown";
  }
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
