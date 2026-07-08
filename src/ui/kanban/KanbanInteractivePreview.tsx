import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { KanbanCard } from "../../core/kanban/ir-types";
import { readCardFields } from "../../core/kanban/meta";
import { useT } from "../EditorHostContext";
import { priorityColorSlug } from "./priority";

/** A column projected for the board, tagged with its index in `ir.items`. */
export interface BoardColumn {
  itemIndex: number;
  /** Stable per-column identity (see `identity.ts`) — used for FLIP + drag targeting. */
  key: string;
  title: string;
  cards: KanbanCard[];
  /** Stable per-card identity, same order as `cards`. */
  cardKeys: string[];
}

interface Props {
  columns: BoardColumn[];
  selected: { col: number; card: number } | null;
  /** For rendering a card's `ticket` field as a clickable link. */
  ticketBaseUrl: string;
  onMoveCard: (srcItem: number, srcIdx: number, dstItem: number, dstIdx: number) => void;
  onReorderColumn: (from: number, to: number) => void;
  onSelectCard: (item: number, idx: number) => void;
  onEditCard: (item: number, idx: number, text: string) => void;
  onDeleteCard: (item: number, idx: number) => void;
  onAddCard: (item: number) => void;
  onEditColumnTitle: (item: number, title: string) => void;
  onDeleteColumn: (item: number) => void;
  onAddColumn: () => void;
}

interface Point {
  left: number;
  top: number;
}

/**
 * FLIP (First-Last-Invert-Play) helper: records each registered node's
 * position via `snapshot()` right before a reorder-triggering mutation, then
 * — once React has re-rendered into the new order — inverts the resulting
 * jump into a transform and animates it back to zero. Nodes are tracked by a
 * caller-supplied stable string key rather than DOM identity, because a card
 * moving between columns unmounts from one `.map()` and mounts in another
 * (React never preserves node identity across sibling lists), so the "before"
 * rect has to be looked up by key against whatever node currently holds it.
 */
const useFlip = (orderKey: string) => {
  const nodes = useRef(new Map<string, HTMLElement>());
  const prevRects = useRef<Map<string, Point> | null>(null);

  const register = useCallback(
    (key: string) => (el: HTMLElement | null) => {
      if (el) nodes.current.set(key, el);
      else nodes.current.delete(key);
    },
    [],
  );

  const snapshot = useCallback(() => {
    const map = new Map<string, Point>();
    nodes.current.forEach((el, key) => {
      const r = el.getBoundingClientRect();
      map.set(key, { left: r.left, top: r.top });
    });
    prevRects.current = map;
  }, []);

  useLayoutEffect(() => {
    const prev = prevRects.current;
    prevRects.current = null;
    if (!prev) return;
    nodes.current.forEach((el, key) => {
      const before = prev.get(key);
      if (!before) return;
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.getBoundingClientRect(); // force reflow before releasing the invert
      requestAnimationFrame(() => {
        el.style.transition = "transform 180ms ease";
        el.style.transform = "";
      });
    });
    // `orderKey` is the derived, comparable form of the current order —
    // re-running this effect whenever it changes is the intended trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderKey]);

  return { register, snapshot };
};

type GhostContent =
  | { kind: "column"; title: string; cardCount: number }
  | { kind: "card"; text: string };

type DragInfo =
  | {
      kind: "column";
      pointerId: number;
      current: number;
      offsetX: number;
      offsetY: number;
      width: number;
      lastX: number;
      lastY: number;
      blockedPartnerKey: string | null;
    }
  | {
      kind: "card";
      pointerId: number;
      col: number;
      idx: number;
      offsetX: number;
      offsetY: number;
      width: number;
      height: number;
      lastX: number;
      lastY: number;
      blockedPartnerKey: string | null;
    };

/** Minimum cursor travel (px) required between reorder evaluations. Without
 * this, swapping two adjacent items can put the *other* item exactly back
 * under a cursor that never actually moved, re-triggering the reverse swap
 * on the very next pointermove and producing a rapid back-and-forth flicker.
 * Gating on distance since the last evaluation — not just on any pointermove
 * firing — breaks that feedback loop while staying responsive to real drag
 * motion. */
const REORDER_THRESHOLD_PX = 10;

/**
 * Fraction of a neighboring item's own size (width for columns, height for
 * cards) the dragged item's *virtual* rect must cover before swapping with
 * it. 0.5 (the midpoint) means swapping same-sized neighbors is normally
 * self-stabilizing: the neighbor moves a full item-length away, so overlap
 * drops to ~0 right after the swap unless the cursor keeps moving. But real
 * cursor input is never perfectly still — sub-pixel jitter right at the 50%
 * line can flip the ratio above/below it repeatedly, and a single threshold
 * has no memory of which side it was just on, so it can re-trigger the swap
 * back and forth. `SWAP_EXIT_RATIO` below adds the missing hysteresis.
 */
const SWAP_ENTER_RATIO = 0.5;

/**
 * Once the dragged item swaps with a given neighbor, that neighbor is
 * "locked out" from triggering another swap until overlap with it drops back
 * below this lower threshold — i.e. the cursor has to visibly move away
 * before a reverse swap is even considered, not just dip a fraction of a
 * percent below `SWAP_ENTER_RATIO`. This is a standard two-threshold
 * (Schmitt trigger) dead zone: entering requires crossing the high
 * threshold, leaving requires dropping below the low one, and nothing
 * happens for values in between.
 */
const SWAP_EXIT_RATIO = 0.3;

/**
 * Hysteresis gate shared by column and card swap targeting: a neighbor
 * identified by `key` is eligible to trigger a swap once overlap reaches
 * `SWAP_ENTER_RATIO` — unless it's the neighbor we most recently swapped
 * with, in which case it stays locked out (mutating `drag.blockedPartnerKey`
 * as a side effect once it releases) until overlap drops below
 * `SWAP_EXIT_RATIO`.
 */
const isSwapArmed = (drag: DragInfo, key: string, ratio: number): boolean => {
  if (key !== drag.blockedPartnerKey) return true;
  if (ratio < SWAP_EXIT_RATIO) drag.blockedPartnerKey = null;
  return false;
};

/**
 * `getBoundingClientRect()` reflects whatever CSS transform is *currently
 * rendered*, including a `useFlip` invert/release transition that's still
 * mid-flight from a previous swap. Repeatedly reversing drag direction fast
 * enough to re-trigger a swap before the previous 180ms animation settles
 * means the overlap math below would be measuring a neighbor against its
 * transiently-animated position instead of its true flex-computed rest
 * position — this is what made the hysteresis lock occasionally get "stuck"
 * on fast back-and-forth drags (fixed by slowing down, i.e. by giving the
 * animation time to finish) rather than never resolving at all. Temporarily
 * clearing `transform` for the measurement (and restoring it immediately
 * after, all synchronously within the same tick, so nothing visibly jumps)
 * decouples hit-testing geometry from in-flight animation state entirely.
 */
const measureRestRect = (el: HTMLElement): DOMRect => {
  const prevTransform = el.style.transform;
  if (prevTransform) el.style.transform = "none";
  const rect = el.getBoundingClientRect();
  if (prevTransform) el.style.transform = prevTransform;
  return rect;
};

/**
 * DOM-based interactive Kanban board used as the EditorShell `previewOverride`.
 * Columns are reorderable via a dedicated header grip; cards are reorderable
 * within and across columns via a dedicated per-card grip. Both use the same
 * live-reorder + FLIP mechanism: the IR mutates on every pointermove that
 * crosses into a new slot (not just on release), and siblings animate into
 * their new positions instead of snapping, so the resulting order is visible
 * before the drag ends. A floating ghost tracks the cursor for the duration
 * of the drag.
 *
 * The drag is tracked via **window-level** pointer listeners rather than
 * `setPointerCapture` on the handle itself (see `DiagramKindPicker`'s
 * `startDrag` for the same pattern, with the same reasoning): reordering
 * moves the dragged node's stable-keyed DOM element to a new spot in the
 * tree, and Chromium implicitly releases pointer capture when the captured
 * element is relocated mid-drag — the ghost would freeze and the reorder
 * would stop the moment the first swap happened. Window listeners have no
 * such attachment to the moving node, so they keep firing for the rest of
 * the gesture regardless of how many times the dragged item's DOM position
 * changes. All mutations are delegated to the host editor (which owns IR +
 * undo).
 */
export const KanbanInteractivePreview = ({
  columns,
  selected,
  ticketBaseUrl,
  onMoveCard,
  onReorderColumn,
  onSelectCard,
  onEditCard,
  onDeleteCard,
  onAddCard,
  onEditColumnTitle,
  onDeleteColumn,
  onAddColumn,
}: Props) => {
  const t = useT();
  const [editing, setEditing] = useState<{ item: number; idx: number } | null>(null);
  const [draggingCol, setDraggingCol] = useState<number | null>(null);
  const [draggingCard, setDraggingCard] = useState<{ col: number; idx: number } | null>(null);
  const [ghost, setGhost] = useState<(GhostContent & { width: number; height: number }) | null>(
    null,
  );

  const dragRef = useRef<DragInfo | null>(null);
  const ghostElRef = useRef<HTMLDivElement | null>(null);
  // Where the ghost's untransformed (0,0) actually paints in viewport space.
  // `position: fixed` is normally relative to the viewport, but it becomes
  // relative to the nearest ancestor with a transform/filter/etc. if one
  // exists — confirmed to differ between the modal's default (centered)
  // placement and its maximized/dragged placement, where an ancestor's
  // containing-block status apparently changes. Measuring this origin fresh
  // at the start of each drag and subtracting it out lands the ghost on the
  // cursor either way, without needing to chase down which ancestor (or
  // which placement) is responsible.
  const ghostOriginRef = useRef({ left: 0, top: 0 });
  // Long-lived window listeners outlive individual renders, so helpers they
  // call must read the *latest* columns rather than whatever was closed over
  // when the listener was attached (which is stale as soon as a live reorder
  // changes card counts / column membership mid-drag).
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const colFlip = useFlip(columns.map((c) => c.key).join("|"));
  const cardFlip = useFlip(columns.map((c) => c.cardKeys.join(",")).join("|"));

  // Columns swap based on how far the *dragged column's own edge* has pushed
  // into a neighbor, not on where the cursor happens to be. The drag handle
  // sits at a column's left edge, so hit-testing at the raw cursor position
  // meant a column grabbed by its handle had to travel its entire width
  // rightward before a right-hand neighbor even registered as "hovered" —
  // and because that first hit was already a deep overlap, the two would
  // immediately re-hit-test into each other on the very next pointermove,
  // producing a rapid swap-back-and-forth. Comparing the dragged column's
  // virtual rect (cursor position minus the original grab offset) against
  // only its immediate left/right neighbor, and requiring a real overlap
  // fraction before swapping, makes the trigger point match where the
  // dragged column visually is and gives it hysteresis against flicker.
  const findColumnSwapTarget = (virtualLeft: number, width: number): number | null => {
    const drag = dragRef.current;
    if (!drag || drag.kind !== "column") return null;
    const cols = columnsRef.current;
    const pos = cols.findIndex((c) => c.itemIndex === drag.current);
    if (pos === -1) return null;
    const virtualRight = virtualLeft + width;
    const overlapRatio = (rect: DOMRect): number => {
      const overlap = Math.min(virtualRight, rect.right) - Math.max(virtualLeft, rect.left);
      return rect.width > 0 ? overlap / rect.width : 0;
    };
    const evaluate = (neighbor: BoardColumn | undefined): number | null => {
      if (!neighbor) return null;
      const el = document.querySelector<HTMLElement>(`[data-kanban-col="${neighbor.itemIndex}"]`);
      if (!el) return null;
      const ratio = overlapRatio(measureRestRect(el));
      if (!isSwapArmed(drag, neighbor.key, ratio) || ratio < SWAP_ENTER_RATIO) return null;
      drag.blockedPartnerKey = neighbor.key;
      return neighbor.itemIndex;
    };
    return evaluate(cols[pos - 1]) ?? evaluate(cols[pos + 1]);
  };

  const cardElAt = (col: number, idx: number): HTMLElement | null =>
    document.querySelector<HTMLElement>(
      `[data-kanban-card-col="${col}"][data-kanban-card-idx="${idx}"]`,
    );

  // Cards use the same "dragged item's own virtual rect vs. its immediate
  // neighbor" logic as columns, for the same reason: the drag handle sits at
  // a card's left edge (not its vertical center), so a card grabbed near its
  // top edge would otherwise need the *cursor* — not the card itself — to
  // travel most of a row's height before a swap even registered, matching
  // neither where the card visually is nor a stable trigger point. Crossing
  // into a different column is decided the same way, using the dragged
  // card's horizontal overlap with the neighboring column, and the insertion
  // index within it is picked by comparing the dragged card's own vertical
  // center against that column's existing cards.
  const findCardSwapTarget = (
    virtualLeft: number,
    virtualTop: number,
    width: number,
    height: number,
  ): { col: number; idx: number } | null => {
    const drag = dragRef.current;
    if (!drag || drag.kind !== "card") return null;
    const cols = columnsRef.current;
    const curCol = cols.find((c) => c.itemIndex === drag.col);
    if (!curCol) return null;

    const virtualRight = virtualLeft + width;
    const virtualBottom = virtualTop + height;
    const overlapRatioY = (rect: DOMRect): number => {
      const overlap = Math.min(virtualBottom, rect.bottom) - Math.max(virtualTop, rect.top);
      return rect.height > 0 ? overlap / rect.height : 0;
    };
    const overlapRatioX = (rect: DOMRect): number => {
      const overlap = Math.min(virtualRight, rect.right) - Math.max(virtualLeft, rect.left);
      return rect.width > 0 ? overlap / rect.width : 0;
    };

    if (drag.idx > 0) {
      const key = curCol.cardKeys[drag.idx - 1];
      const el = cardElAt(drag.col, drag.idx - 1);
      if (el) {
        const ratio = overlapRatioY(measureRestRect(el));
        if (isSwapArmed(drag, key, ratio) && ratio >= SWAP_ENTER_RATIO) {
          drag.blockedPartnerKey = key;
          return { col: drag.col, idx: drag.idx - 1 };
        }
      }
    }
    if (drag.idx < curCol.cards.length - 1) {
      const key = curCol.cardKeys[drag.idx + 1];
      const el = cardElAt(drag.col, drag.idx + 1);
      if (el) {
        const ratio = overlapRatioY(measureRestRect(el));
        if (isSwapArmed(drag, key, ratio) && ratio >= SWAP_ENTER_RATIO) {
          drag.blockedPartnerKey = key;
          // "Insert before idx+2" is "insert after idx+1" in the pre-removal
          // numbering `onMoveCard` expects (mirrors the old point-based
          // "after" case, which used the same neighbor+1 encoding).
          return { col: drag.col, idx: drag.idx + 2 };
        }
      }
    }

    const curColIdx = cols.findIndex((c) => c.itemIndex === drag.col);
    const tryAdjacentColumn = (neighborCol: BoardColumn | undefined) => {
      if (!neighborCol) return null;
      const colEl = document.querySelector<HTMLElement>(
        `[data-kanban-col="${neighborCol.itemIndex}"]`,
      );
      if (!colEl) return null;
      const ratio = overlapRatioX(measureRestRect(colEl));
      if (!isSwapArmed(drag, neighborCol.key, ratio) || ratio < SWAP_ENTER_RATIO) return null;
      drag.blockedPartnerKey = neighborCol.key;
      const virtualCenterY = virtualTop + height / 2;
      let insertIdx = neighborCol.cards.length;
      for (let i = 0; i < neighborCol.cards.length; i++) {
        const el = cardElAt(neighborCol.itemIndex, i);
        if (!el) continue;
        const rect = measureRestRect(el);
        if (virtualCenterY < rect.top + rect.height / 2) {
          insertIdx = i;
          break;
        }
      }
      return { col: neighborCol.itemIndex, idx: insertIdx };
    };
    return tryAdjacentColumn(cols[curColIdx - 1]) ?? tryAdjacentColumn(cols[curColIdx + 1]);
  };

  const positionGhost = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const el = ghostElRef.current;
    if (!drag || !el) return;
    const origin = ghostOriginRef.current;
    const desiredX = clientX - drag.offsetX;
    const desiredY = clientY - drag.offsetY;
    el.style.transform = `translate3d(${desiredX - origin.left}px, ${desiredY - origin.top}px, 0)`;
  };

  const measureGhostOrigin = () => {
    const el = ghostElRef.current;
    if (!el) return;
    el.style.transform = "translate3d(0px, 0px, 0)";
    const rect = el.getBoundingClientRect();
    ghostOriginRef.current = { left: rect.left, top: rect.top };
  };

  // Runs for the whole lifetime of a drag gesture, independent of how many
  // times the dragged element's own DOM node relocates in between (see the
  // component doc comment above for why this can't be per-element capture).
  useEffect(() => {
    if (!ghost) return;

    const handleMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      positionGhost(e.clientX, e.clientY);

      const traveled = Math.hypot(e.clientX - drag.lastX, e.clientY - drag.lastY);
      if (traveled < REORDER_THRESHOLD_PX) return;
      // Reset the reference point as soon as we're willing to evaluate again,
      // regardless of whether this evaluation actually reorders anything —
      // this is what enforces "at most one evaluation per N px of travel"
      // rather than "at most one reorder per N px."
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;

      if (drag.kind === "column") {
        const virtualLeft = e.clientX - drag.offsetX;
        const target = findColumnSwapTarget(virtualLeft, drag.width);
        if (target === null || target === drag.current) return;
        colFlip.snapshot();
        onReorderColumn(drag.current, target);
        drag.current = target;
        setDraggingCol(target);
        return;
      }

      const virtualCardLeft = e.clientX - drag.offsetX;
      const virtualCardTop = e.clientY - drag.offsetY;
      const target = findCardSwapTarget(virtualCardLeft, virtualCardTop, drag.width, drag.height);
      if (!target) return;
      if (target.col === drag.col && target.idx === drag.idx) return;
      // Mirror `moveCard`'s own same-column-descending-index compensation so
      // our tracked "current slot" matches where the card actually lands.
      let finalIdx = target.idx;
      if (target.col === drag.col && drag.idx < target.idx) finalIdx -= 1;
      if (target.col === drag.col && finalIdx === drag.idx) return;
      cardFlip.snapshot();
      onMoveCard(drag.col, drag.idx, target.col, target.idx);
      drag.col = target.col;
      drag.idx = finalIdx;
      setDraggingCard({ col: target.col, idx: finalIdx });
    };

    const handleEnd = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      setDraggingCol(null);
      setDraggingCard(null);
      setGhost(null);
      // `onMoveCard` has no "select the result" side effect of its own since
      // it now fires continuously mid-drag — select the card's final resting
      // slot once the gesture actually ends.
      if (drag.kind === "card") onSelectCard(drag.col, drag.idx);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
    };
    // Intentionally gated on `ghost` alone (flips exactly once at drag start
    // and once at drag end) — `onReorderColumn`/`onMoveCard`/`onSelectCard`
    // are stable callbacks from the host, and `colFlip.snapshot` /
    // `cardFlip.snapshot` close over refs, so re-subscribing on every
    // mid-drag re-render is unnecessary churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghost]);

  const startColDrag = (idx: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const colEl = e.currentTarget.closest<HTMLElement>("[data-kanban-col]");
    const rect = colEl?.getBoundingClientRect();
    const col = columnsRef.current.find((c) => c.itemIndex === idx);
    dragRef.current = {
      kind: "column",
      pointerId: e.pointerId,
      current: idx,
      offsetX: rect ? e.clientX - rect.left : 0,
      offsetY: rect ? e.clientY - rect.top : 0,
      width: rect?.width ?? 200,
      lastX: e.clientX,
      lastY: e.clientY,
      blockedPartnerKey: null,
    };
    setDraggingCol(idx);
    setGhost({
      kind: "column",
      title: col?.title ?? "",
      cardCount: col?.cards.length ?? 0,
      width: rect?.width ?? 200,
      height: rect?.height ?? 40,
    });
    requestAnimationFrame(() => {
      measureGhostOrigin();
      positionGhost(e.clientX, e.clientY);
    });
  };

  const startCardDrag = (col: number, idx: number) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const cardEl = e.currentTarget.closest<HTMLElement>("[data-kanban-card]");
    const rect = cardEl?.getBoundingClientRect();
    const card = columnsRef.current.find((c) => c.itemIndex === col)?.cards[idx];
    dragRef.current = {
      kind: "card",
      pointerId: e.pointerId,
      col,
      idx,
      offsetX: rect ? e.clientX - rect.left : 0,
      offsetY: rect ? e.clientY - rect.top : 0,
      width: rect?.width ?? 160,
      height: rect?.height ?? 32,
      lastX: e.clientX,
      lastY: e.clientY,
      blockedPartnerKey: null,
    };
    setDraggingCard({ col, idx });
    setGhost({
      kind: "card",
      text: card?.text ?? "",
      width: rect?.width ?? 160,
      height: rect?.height ?? 32,
    });
    requestAnimationFrame(() => {
      measureGhostOrigin();
      positionGhost(e.clientX, e.clientY);
    });
  };

  return (
    <div className="mge-kanban-board">
      {columns.map((col) => (
        <div
          key={col.key}
          ref={colFlip.register(col.key)}
          className={"mge-kanban-column" + (draggingCol === col.itemIndex ? " dragging" : "")}
          data-kanban-col={col.itemIndex}
        >
          <div className="mge-kanban-col-header">
            <button
              className="mge-kanban-col-handle"
              type="button"
              aria-label={t.kanban.columnHandle}
              onPointerDown={startColDrag(col.itemIndex)}
            >
              <span className="mge-kanban-col-grip" aria-hidden="true" />
            </button>
            <input
              className="mge-kanban-col-title"
              value={col.title}
              onChange={(e) => onEditColumnTitle(col.itemIndex, e.target.value)}
              placeholder={t.kanban.columnTitlePlaceholder}
            />
            <button
              className="mge-kanban-col-del"
              title={t.kanban.deleteColumn}
              onClick={() => onDeleteColumn(col.itemIndex)}
            >
              ×
            </button>
          </div>

          <div className="mge-kanban-cards" data-kanban-cards={col.itemIndex}>
            {col.cards.map((card, idx) => {
              const cardKey = col.cardKeys[idx];
              const isSel = selected?.col === col.itemIndex && selected.card === idx;
              const isEditing = editing?.item === col.itemIndex && editing.idx === idx;
              const isDragging =
                draggingCard?.col === col.itemIndex && draggingCard.idx === idx;
              const fields = readCardFields(card.metaRaw);
              const priorityClass = fields.priority
                ? ` mge-kanban-card-priority-${priorityColorSlug(fields.priority)}`
                : "";
              return (
                <div
                  key={cardKey}
                  ref={cardFlip.register(cardKey)}
                  className={
                    "mge-kanban-card" +
                    (isSel ? " selected" : "") +
                    (isDragging ? " dragging" : "") +
                    priorityClass
                  }
                  data-kanban-card
                  data-kanban-card-col={col.itemIndex}
                  data-kanban-card-idx={idx}
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
                      <div className="mge-kanban-card-row">
                        <button
                          className="mge-kanban-card-handle"
                          type="button"
                          aria-label={t.kanban.taskHandle}
                          onClick={(e) => e.stopPropagation()}
                          onPointerDown={startCardDrag(col.itemIndex, idx)}
                        >
                          <span className="mge-kanban-card-grip" aria-hidden="true" />
                        </button>
                        <span className="mge-kanban-card-text">
                          {card.text || t.kanban.emptyCardText}
                        </span>
                        <button
                          className="mge-kanban-card-del"
                          title={t.kanban.deleteCard}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCard(col.itemIndex, idx);
                          }}
                        >
                          ×
                        </button>
                      </div>
                      {fields.ticket || fields.assigned ? (
                        <div className="mge-kanban-card-meta-row">
                          {fields.ticket ? (
                            ticketBaseUrl ? (
                              <a
                                className="mge-kanban-ticket-badge"
                                href={ticketBaseUrl.replace("#TICKET#", fields.ticket)}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={fields.ticket}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {fields.ticket}
                              </a>
                            ) : (
                              <span className="mge-kanban-ticket-badge" title={fields.ticket}>
                                {fields.ticket}
                              </span>
                            )
                          ) : null}
                          {fields.assigned ? (
                            <span className="mge-kanban-assignee-badge">{fields.assigned}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
            <button className="mge-kanban-add-card" onClick={() => onAddCard(col.itemIndex)}>
              {t.kanban.addCard}
            </button>
          </div>
        </div>
      ))}

      <button className="mge-kanban-add-col" onClick={onAddColumn}>
        {t.kanban.addColumn}
      </button>

      {ghost ? (
        <div
          ref={ghostElRef}
          className={`mge-kanban-ghost mge-kanban-ghost-${ghost.kind}`}
          style={{ width: ghost.width, height: ghost.kind === "card" ? ghost.height : undefined }}
        >
          {ghost.kind === "column" ? (
            <>
              <span className="mge-kanban-ghost-title">{ghost.title || t.kanban.ghostUntitled}</span>
              <span className="mge-kanban-ghost-count">{t.kanban.ghostCardCount(ghost.cardCount)}</span>
            </>
          ) : (
            <span className="mge-kanban-ghost-text">{ghost.text || t.kanban.emptyCardText}</span>
          )}
        </div>
      ) : null}
    </div>
  );
};
