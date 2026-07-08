import type { KanbanCard, KanbanColumn, KanbanIR } from "./ir-types";

const COLUMN_INDENT = "  "; // 2 spaces
const CARD_INDENT = "    "; // 4 spaces — must be deeper than columns

const renderToken = (id: string | undefined, text: string, bracketed: boolean): string => {
  if (!bracketed) return text;
  return `${id ?? ""}[${text}]`;
};

const renderCard = (card: KanbanCard): string => {
  const head = renderToken(card.id, card.text, card.bracketed);
  if (!card.metaRaw) return head;
  // `]@{...}` is unambiguous so bracketed cards keep meta flush (matches the
  // canonical Mermaid form); bare text needs a space to stay separable.
  return card.bracketed ? `${head}${card.metaRaw}` : `${head} ${card.metaRaw}`;
};

const renderColumn = (col: KanbanColumn): string[] => {
  const head = renderToken(col.id, col.title, col.bracketed);
  const lines = [COLUMN_INDENT + (col.keyword ? `column ${head}` : head)];
  for (const card of col.cards) lines.push(CARD_INDENT + renderCard(card));
  return lines;
};

/** Serialise a Kanban IR back to Mermaid source (indentation-sensitive). */
export function generateKanban(ir: KanbanIR): string {
  const lines: string[] = ["kanban"];
  for (const item of ir.items) {
    if (item.type === "raw") {
      lines.push(item.line);
      continue;
    }
    lines.push(...renderColumn(item));
  }
  const body = lines.join("\n");
  return ir.frontmatterRaw ? `${ir.frontmatterRaw}\n${body}` : body;
}
