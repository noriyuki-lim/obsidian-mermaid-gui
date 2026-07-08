/**
 * Kanban IR. Mermaid's kanban syntax is indentation-sensitive: columns sit at
 * the base indent under the `kanban` header, and each column's cards are
 * indented one level deeper. A card may carry a trailing `@{ ... }` metadata
 * block (assigned / ticket / priority / …). We preserve that block verbatim
 * (`metaRaw`) and remember whether the original used `[brackets]` so the
 * round-trip is loss-free without us having to model every metadata key.
 */
export interface KanbanCard {
  /** Optional explicit id (`id[Text]`). Absent for bare `[Text]`. */
  id?: string;
  /** Card text (inside brackets, or the bare line). */
  text: string;
  /** True when the source wrote `[Text]`; false for a bare token. */
  bracketed: boolean;
  /** Trailing `@{ ... }` metadata, stored verbatim (includes the `@{}`). */
  metaRaw?: string;
}

export interface KanbanColumn {
  type: "column";
  /** Optional explicit id (`id[Title]`). Absent for bare `[Title]` / `Title`. */
  id?: string;
  title: string;
  /** True when the source wrote `[Title]`; false for a bare `Title`. */
  bracketed: boolean;
  /** True when the source used the `column <id>[<title>]` keyword form. */
  keyword?: boolean;
  cards: KanbanCard[];
}

/** Any line we could not classify — preserved verbatim for round-trip. */
export interface KanbanRawItem {
  type: "raw";
  line: string;
}

export type KanbanItem = KanbanColumn | KanbanRawItem;

export interface KanbanIR {
  kind: "kanban";
  items: KanbanItem[];
  /** Leading `---\n...\n---` frontmatter block, preserved verbatim. */
  frontmatterRaw?: string;
}
