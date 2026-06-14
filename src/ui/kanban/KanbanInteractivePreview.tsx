import { useState, type DragEvent } from "react";
import type { KanbanCard } from "../../core/kanban/ir-types";

/** A column projected for the board, tagged with its index in `ir.items`. */
export interface BoardColumn {
  itemIndex: number;
  title: string;
  cards: KanbanCard[];
}

interface Props {
  columns: BoardColumn[];
  selected: { col: number; card: number } | null;
  onMoveCard: (srcItem: number, srcIdx: number, dstItem: number, dstIdx: number) => void;
  onSelectCard: (item: number, idx: number) => void;
  onEditCard: (item: number, idx: number, text: string) => void;
  onDeleteCard: (item: number, idx: number) => void;
  onAddCard: (item: number) => void;
  onEditColumnTitle: (item: number, title: string) => void;
  onDeleteColumn: (item: number) => void;
  onAddColumn: () => void;
}

const DRAG_MIME = "application/x-mge-kanban-card";

interface DragPayload {
  srcItem: number;
  srcIdx: number;
}

const readPayload = (e: DragEvent): DragPayload | null => {
  try {
    const raw = e.dataTransfer.getData(DRAG_MIME);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p.srcItem === "number" && typeof p.srcIdx === "number") return p;
  } catch {
    /* ignore malformed drag data */
  }
  return null;
};

/**
 * DOM-based interactive Kanban board used as the EditorShell `previewOverride`.
 * Cards are HTML5-draggable between columns and reorderable within a column;
 * dropping on a card inserts before it, dropping on the column body appends.
 * All mutations are delegated to the host editor (which owns IR + undo).
 */
export const KanbanInteractivePreview = ({
  columns,
  selected,
  onMoveCard,
  onSelectCard,
  onEditCard,
  onDeleteCard,
  onAddCard,
  onEditColumnTitle,
  onDeleteColumn,
  onAddColumn,
}: Props) => {
  const [editing, setEditing] = useState<{ item: number; idx: number } | null>(null);
  const [dropHint, setDropHint] = useState<{ item: number; idx: number } | null>(null);

  const onDragStart = (srcItem: number, srcIdx: number) => (e: DragEvent) => {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify({ srcItem, srcIdx }));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDrop = (dstItem: number, dstIdx: number) => (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropHint(null);
    const p = readPayload(e);
    if (!p) return;
    onMoveCard(p.srcItem, p.srcIdx, dstItem, dstIdx);
  };

  const allowDrop = (item: number, idx: number) => (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropHint({ item, idx });
  };

  return (
    <div className="mge-kanban-board">
      {columns.map((col) => (
        <div
          key={col.itemIndex}
          className="mge-kanban-column"
          onDragOver={allowDrop(col.itemIndex, col.cards.length)}
          onDrop={handleDrop(col.itemIndex, col.cards.length)}
        >
          <div className="mge-kanban-col-header">
            <input
              className="mge-kanban-col-title"
              value={col.title}
              onChange={(e) => onEditColumnTitle(col.itemIndex, e.target.value)}
              placeholder="列タイトル"
            />
            <button
              className="mge-kanban-col-del"
              title="列を削除"
              onClick={() => onDeleteColumn(col.itemIndex)}
            >
              ×
            </button>
          </div>

          <div className="mge-kanban-cards">
            {col.cards.map((card, idx) => {
              const isSel = selected?.col === col.itemIndex && selected.card === idx;
              const isEditing = editing?.item === col.itemIndex && editing.idx === idx;
              const showDropLine = dropHint?.item === col.itemIndex && dropHint.idx === idx;
              return (
                <div
                  key={idx}
                  className={
                    "mge-kanban-card" +
                    (isSel ? " selected" : "") +
                    (showDropLine ? " drop-before" : "")
                  }
                  draggable={!isEditing}
                  onDragStart={onDragStart(col.itemIndex, idx)}
                  onDragOver={allowDrop(col.itemIndex, idx)}
                  onDrop={handleDrop(col.itemIndex, idx)}
                  onClick={() => onSelectCard(col.itemIndex, idx)}
                  onDoubleClick={() => setEditing({ item: col.itemIndex, idx })}
                >
                  {isEditing ? (
                    <input
                      className="mge-kanban-card-input"
                      autoFocus
                      defaultValue={card.text}
                      onBlur={(e) => {
                        onEditCard(col.itemIndex, idx, e.target.value);
                        setEditing(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onEditCard(col.itemIndex, idx, (e.target as HTMLInputElement).value);
                          setEditing(null);
                        } else if (e.key === "Escape") {
                          setEditing(null);
                        }
                      }}
                    />
                  ) : (
                    <>
                      <span className="mge-kanban-card-text">{card.text || "(空)"}</span>
                      {card.metaRaw ? (
                        <span className="mge-kanban-card-meta" title={card.metaRaw}>
                          ⓘ
                        </span>
                      ) : null}
                      <button
                        className="mge-kanban-card-del"
                        title="カードを削除"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteCard(col.itemIndex, idx);
                        }}
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              );
            })}
            <button className="mge-kanban-add-card" onClick={() => onAddCard(col.itemIndex)}>
              + カード
            </button>
          </div>
        </div>
      ))}

      <button className="mge-kanban-add-col" onClick={onAddColumn}>
        + 列
      </button>
    </div>
  );
};
