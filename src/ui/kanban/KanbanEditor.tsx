import { useCallback, useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { parseKanban } from "../../core/kanban/parser";
import { generateKanban } from "../../core/kanban/generator";
import { readTicketBaseUrl, writeTicketBaseUrl } from "../../core/kanban/frontmatter";
import { readCardFields, writeCardFields, type KanbanCardFields } from "../../core/kanban/meta";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import { useT } from "../EditorHostContext";
import { KanbanInteractivePreview, type BoardColumn } from "./KanbanInteractivePreview";
import { KanbanOptionsPanel } from "./KanbanOptionsPanel";
import { identityKey } from "./identity";
import type { KanbanCard, KanbanColumn, KanbanIR, KanbanItem } from "../../core/kanban/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

const seed = (initialSource: string): KanbanIR => {
  const outcome = parseKanban(initialSource);
  if (outcome.ok) return outcome.ir;
  return { kind: "kanban", items: [] };
};

const isColumn = (item: KanbanItem): item is KanbanColumn => item.type === "column";

/** Apply `fn` to the column stored at `ir.items[itemIndex]`, returning new IR. */
const withColumn = (
  ir: KanbanIR,
  itemIndex: number,
  fn: (col: KanbanColumn) => KanbanColumn,
): KanbanIR => ({
  ...ir,
  items: ir.items.map((it, i) => (i === itemIndex && isColumn(it) ? fn(it) : it)),
});

export const KanbanEditor = ({ initialSource, onSave, onCancel }: Props) => {
  // Like the other graphical editors, the interactive board replaces Mermaid's
  // static render via `previewOverride`; `renderMermaid` is intentionally unused.
  const t = useT();
  const [ir, setIr] = useState<KanbanIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<{ col: number; card: number } | null>(null);

  const columns = useMemo<BoardColumn[]>(() => {
    const out: BoardColumn[] = [];
    ir.items.forEach((it, itemIndex) => {
      if (isColumn(it)) {
        out.push({
          itemIndex,
          key: identityKey(it),
          title: it.title,
          cards: it.cards,
          cardKeys: it.cards.map(identityKey),
        });
      }
    });
    return out;
  }, [ir.items]);

  const moveCard = useCallback(
    (srcItem: number, srcIdx: number, dstItem: number, dstIdx: number) => {
      setIr((prev) => {
        const src = prev.items[srcItem];
        if (!src || !isColumn(src)) return prev;
        const card = src.cards[srcIdx];
        if (!card) return prev;
        // Remove from source first, then compute the (possibly shifted) insert
        // index when moving within the same column.
        let insertAt = dstIdx;
        if (srcItem === dstItem && srcIdx < dstIdx) insertAt -= 1;
        const items = prev.items.map((it) => it);
        const removeFrom = { ...src, cards: src.cards.filter((_, i) => i !== srcIdx) };
        items[srcItem] = removeFrom;
        const dst = items[dstItem];
        if (!dst || !isColumn(dst)) return prev;
        const dstCards = dst.cards.slice();
        dstCards.splice(Math.max(0, Math.min(insertAt, dstCards.length)), 0, card);
        items[dstItem] = { ...dst, cards: dstCards };
        return { ...prev, items };
      });
    },
    [],
  );

  const editCard = useCallback((item: number, idx: number, text: string) => {
    setIr((prev) =>
      withColumn(prev, item, (col) => ({
        ...col,
        cards: col.cards.map((c, i) => (i === idx ? { ...c, text } : c)),
      })),
    );
  }, []);

  const deleteCard = useCallback((item: number, idx: number) => {
    setIr((prev) =>
      withColumn(prev, item, (col) => ({
        ...col,
        cards: col.cards.filter((_, i) => i !== idx),
      })),
    );
    setSelected(null);
  }, []);

  const addCard = useCallback((item: number) => {
    const card: KanbanCard = { text: "New card", bracketed: true };
    setIr((prev) => withColumn(prev, item, (col) => ({ ...col, cards: [...col.cards, card] })));
  }, []);

  const editColumnTitle = useCallback((item: number, title: string) => {
    setIr((prev) => withColumn(prev, item, (col) => ({ ...col, title })));
  }, []);

  const deleteColumn = useCallback((item: number) => {
    setIr((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== item) }));
    setSelected(null);
  }, []);

  const addColumn = useCallback(() => {
    const col: KanbanColumn = { type: "column", title: "New column", bracketed: true, cards: [] };
    setIr((prev) => ({ ...prev, items: [...prev.items, col] }));
  }, []);

  const setTicketBaseUrl = useCallback((value: string) => {
    setIr((prev) => ({ ...prev, frontmatterRaw: writeTicketBaseUrl(prev.frontmatterRaw, value) }));
  }, []);

  const setCardField = useCallback((item: number, idx: number, field: keyof KanbanCardFields, value: string) => {
    setIr((prev) =>
      withColumn(prev, item, (col) => ({
        ...col,
        cards: col.cards.map((c, i) =>
          i === idx ? { ...c, metaRaw: writeCardFields(c.metaRaw, { [field]: value || undefined }) } : c,
        ),
      })),
    );
  }, []);

  const moveColumn = useCallback((from: number, to: number) => {
    setIr((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.items.length || to >= prev.items.length) {
        return prev;
      }
      const items = prev.items.slice();
      const [item] = items.splice(from, 1);
      items.splice(to, 0, item);
      return { ...prev, items };
    });
    setSelected(null);
  }, []);

  const onBodyKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.key === "Delete" || e.key === "Backspace") && selected) {
      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || target.isContentEditable) return;
      e.preventDefault();
      deleteCard(selected.col, selected.card);
    }
  };

  // Clicking anywhere that isn't inside a card (column padding, the gap past
  // the last column, below the board, the preview note, …) clears the
  // selection. Checked by ancestry rather than `target === currentTarget` so
  // it also covers space inside a column (below its cards, beside its
  // header) — not just the wrapper's own bare background.
  const onBoardClick = (e: MouseEvent<HTMLDivElement>) => {
    if (!selected) return;
    const target = e.target as HTMLElement;
    if (!target.closest(".mge-kanban-card")) setSelected(null);
  };

  const currentSource = useMemo(() => generateKanban(ir), [ir]);

  const ticketBaseUrl = useMemo(() => readTicketBaseUrl(ir.frontmatterRaw), [ir.frontmatterRaw]);

  const selectedCardFields = useMemo(() => {
    if (!selected) return null;
    const col = ir.items[selected.col];
    if (!col || !isColumn(col)) return null;
    const card = col.cards[selected.card];
    return card ? readCardFields(card.metaRaw) : null;
  }, [ir.items, selected]);

  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const outcome = parseKanban(next);
    if (!outcome.ok) return { ok: false, error: outcome.message };
    setIr(outcome.ir);
    setSelected(null);
    return { ok: true };
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(currentSource);
    } finally {
      setSaving(false);
    }
  }, [saving, currentSource, onSave]);

  return (
    <EditorShell
      diagramKind="kanban"
      currentSource={currentSource}
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      layout="stacked"
      sourceInitiallyOpen
      sourceToggleLabel={t.common.showSource}
      previewOverride={
        <div
          className="mge-kanban-board-wrap"
          tabIndex={-1}
          onKeyDown={onBodyKeyDown}
          onClick={onBoardClick}
        >
          <div className="mge-kanban-preview-note">{t.kanban.previewNote}</div>
          <KanbanInteractivePreview
            columns={columns}
            selected={selected}
            ticketBaseUrl={ticketBaseUrl}
            onMoveCard={moveCard}
            onReorderColumn={moveColumn}
            onSelectCard={(col, card) => setSelected({ col, card })}
            onEditCard={editCard}
            onDeleteCard={deleteCard}
            onAddCard={addCard}
            onEditColumnTitle={editColumnTitle}
            onDeleteColumn={deleteColumn}
            onAddColumn={addColumn}
          />
        </div>
      }
      sidePanel={
        <KanbanOptionsPanel
          ticketBaseUrl={ticketBaseUrl}
          onTicketBaseUrlChange={setTicketBaseUrl}
          selectedCardFields={selectedCardFields}
          onCardFieldChange={(field, value) =>
            selected && setCardField(selected.col, selected.card, field, value)
          }
        />
      }
      onSourceEdit={handleSourceEdit}
    />
  );
};
