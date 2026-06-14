import { useCallback, useRef, useState } from "react";
import type { BlockIR, BlockItem, BlockNode } from "../../core/block/ir-types";

interface Props {
  ir: BlockIR;
  selectedIdx: number | null;
  onSelect: (itemIdx: number | null) => void;
  onReorder: (fromIdx: number, toIdx: number) => void;
  onResizeSpan: (itemIdx: number, newSpan: number) => void;
}

/** Shape bracket to CSS class suffix */
const shapeClass = (node: BlockNode): string => {
  const o = node.shapeOpen ?? "[";
  if (o === "((") return "circle";
  if (o === "(") return "rounded";
  if (o === "[(") return "cylinder";
  if (o === ">") return "ribbon";
  return "square";
};

/** Shape bracket to SVG rx (corner radius) */
const shapeRx = (node: BlockNode): number => {
  const o = node.shapeOpen ?? "[";
  if (o === "((" || o === "(") return 50; // will be clamped by viewBox
  if (o === "[(") return 4;
  return 2;
};

/**
 * Compute a flat "cell sequence" from BlockIR items, honouring the `columns N`
 * directive and per-item span. Returns a list of display cells with their
 * position in the grid and a reference back to the item index.
 */
interface GridCell {
  itemIdx: number;
  item: BlockItem;
  /** 1-based column start */
  colStart: number;
  /** column span */
  colSpan: number;
  /** 1-based row */
  row: number;
}

function buildGrid(items: BlockItem[]): { cells: GridCell[]; columns: number; rows: number } {
  let columns = 1;
  let cursor = 0; // position within the current row (0-indexed)
  let currentRow = 1;
  const cells: GridCell[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type === "columns") {
      const n = parseInt(item.count, 10);
      if (Number.isFinite(n) && n > 0) columns = n;
      continue;
    }
    if (item.type === "raw") continue;

    const span = Math.min(
      Math.max(1, (item.type === "block" || item.type === "space") ? (item.span ?? 1) : 1),
      columns,
    );

    // Wrap to next row if this span doesn't fit in the remaining columns.
    if (cursor + span > columns) {
      currentRow++;
      cursor = 0;
    }

    cells.push({
      itemIdx: i,
      item,
      colStart: cursor + 1,
      colSpan: span,
      row: currentRow,
    });

    cursor += span;
    if (cursor >= columns) {
      cursor = 0;
      currentRow++;
    }
  }

  const rows = cells.length === 0 ? 1 : Math.max(...cells.map((c) => c.row));
  return { cells, columns, rows };
}

// ──────────────────────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────────────────────
const CELL_W = 110;
const CELL_H = 54;
const GAP = 10;
const PAD = 16;
const RESIZE_HANDLE_W = 10;

// ──────────────────────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────────────────────
export const BlockInteractivePreview = ({
  ir,
  selectedIdx,
  onSelect,
  onReorder,
  onResizeSpan,
}: Props) => {
  const { cells, columns, rows } = buildGrid(ir.items);

  const svgWidth = PAD * 2 + columns * CELL_W + (columns - 1) * GAP;
  const svgHeight = PAD * 2 + rows * CELL_H + (rows - 1) * GAP;

  // ── drag-to-reorder state ──────────────────────────────────────────────────
  const dragRef = useRef<{
    itemIdx: number;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null); // itemIdx of drop target

  // ── resize-span state ─────────────────────────────────────────────────────
  const resizeRef = useRef<{
    itemIdx: number;
    pointerId: number;
    origSpan: number;
    startX: number;
    colStart: number;
  } | null>(null);
  const [resizingIdx, setResizingIdx] = useState<number | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  /** Convert client XY to SVG user-space XY */
  const toSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const sx = (clientX - r.left) / r.width * svgWidth;
    const sy = (clientY - r.top) / r.height * svgHeight;
    return { x: sx, y: sy };
  }, [svgWidth, svgHeight]);

  /** Given SVG x,y return which cell (0-based column, 0-based row) we're over */
  const hitCell = useCallback((sx: number, sy: number): { col: number; row: number } => {
    const col = Math.floor((sx - PAD) / (CELL_W + GAP));
    const row = Math.floor((sy - PAD) / (CELL_H + GAP));
    return {
      col: Math.max(0, Math.min(columns - 1, col)),
      row: Math.max(0, Math.min(rows - 1, row)),
    };
  }, [columns, rows]);

  /** Find the cell closest to (col, row) from the grid cells list */
  const nearestCellItemIdx = useCallback((col: number, row: number): number | null => {
    if (cells.length === 0) return null;
    let best: GridCell | null = null;
    let bestDist = Infinity;
    for (const c of cells) {
      const dc = c.colStart - 1 - col;
      const dr = c.row - 1 - row;
      const dist = Math.abs(dc) + Math.abs(dr);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    return best ? best.itemIdx : null;
  }, [cells]);

  // ── Pointer handlers ───────────────────────────────────────────────────────
  const onBlockPointerDown = (
    itemIdx: number,
    e: React.PointerEvent<SVGElement>,
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      itemIdx,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    setDragOver(null);
  };

  const onResizePointerDown = (
    itemIdx: number,
    colStart: number,
    currentSpan: number,
    e: React.PointerEvent<SVGElement>,
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    resizeRef.current = {
      itemIdx,
      pointerId: e.pointerId,
      origSpan: currentSpan,
      startX: e.clientX,
      colStart,
    };
    setResizingIdx(itemIdx);
  };

  const onSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    // drag-to-reorder
    const drag = dragRef.current;
    if (drag && drag.pointerId === e.pointerId) {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        drag.moved = true;
      }
      if (drag.moved) {
        const loc = toSvg(e.clientX, e.clientY);
        if (loc) {
          const { col, row } = hitCell(loc.x, loc.y);
          const nearest = nearestCellItemIdx(col, row);
          setDragOver(nearest !== drag.itemIdx ? nearest : null);
        }
      }
      return;
    }

    // resize-span
    const resize = resizeRef.current;
    if (resize && resize.pointerId === e.pointerId) {
      const loc = toSvg(e.clientX, e.clientY);
      if (!loc) return;
      // Determine target column end from mouse x
      const colEnd = Math.round((loc.x - PAD) / (CELL_W + GAP));
      const newSpan = Math.max(1, Math.min(columns - resize.colStart + 1, colEnd - resize.colStart + 1));
      if (newSpan !== resize.origSpan) {
        onResizeSpan(resize.itemIdx, newSpan);
        resize.origSpan = newSpan; // update so next move is relative to new span
      }
    }
  };

  const onSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    // drag-to-reorder
    const drag = dragRef.current;
    if (drag && drag.pointerId === e.pointerId) {
      dragRef.current = null;
      if (!drag.moved) {
        // treat as click → select
        onSelect(drag.itemIdx === selectedIdx ? null : drag.itemIdx);
      } else if (dragOver !== null) {
        onReorder(drag.itemIdx, dragOver);
      }
      setDragOver(null);
      return;
    }

    // resize-span
    const resize = resizeRef.current;
    if (resize && resize.pointerId === e.pointerId) {
      resizeRef.current = null;
      setResizingIdx(null);
    }
  };

  const onSvgPointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      setDragOver(null);
    }
    if (resizeRef.current?.pointerId === e.pointerId) {
      resizeRef.current = null;
      setResizingIdx(null);
    }
  };

  // Deselect when clicking the background
  const onBgClick = () => onSelect(null);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mge-block-preview">
      <svg
        ref={svgRef}
        className="mge-block-preview-svg"
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={onSvgPointerMove}
        onPointerUp={onSvgPointerUp}
        onPointerCancel={onSvgPointerCancel}
      >
        {/* Background — click to deselect */}
        <rect
          x={0} y={0}
          width={svgWidth} height={svgHeight}
          className="mge-block-preview-bg"
          onClick={onBgClick}
        />

        {/* Grid guide lines */}
        {Array.from({ length: columns + 1 }, (_, ci) => {
          const x = PAD + ci * (CELL_W + GAP) - GAP / 2;
          return (
            <line
              key={`vg-${ci}`}
              x1={x} y1={PAD}
              x2={x} y2={svgHeight - PAD}
              className="mge-block-grid-guide"
            />
          );
        })}

        {/* Cells */}
        {cells.map((cell) => {
          const { itemIdx, item, colStart, colSpan, row } = cell;
          const x = PAD + (colStart - 1) * (CELL_W + GAP);
          const y = PAD + (row - 1) * (CELL_H + GAP);
          const w = colSpan * CELL_W + (colSpan - 1) * GAP;
          const h = CELL_H;
          const isSelected = selectedIdx === itemIdx;
          const isDragSrc = dragRef.current?.itemIdx === itemIdx;
          const isDropTarget = dragOver === itemIdx;
          const isResizing = resizingIdx === itemIdx;

          if (item.type === "space") {
            return (
              <g key={itemIdx}
                className={`mge-block-cell mge-block-cell-space${isDropTarget ? " mge-block-cell-droptarget" : ""}`}
                onPointerDown={(e) => onBlockPointerDown(itemIdx, e)}
              >
                <rect
                  x={x} y={y} width={w} height={h} rx={2}
                  className="mge-block-space-rect"
                />
                <text
                  x={x + w / 2} y={y + h / 2}
                  textAnchor="middle" dominantBaseline="middle"
                  className="mge-block-space-label"
                >
                  space
                </text>
                {/* Resize handle */}
                <rect
                  x={x + w - RESIZE_HANDLE_W} y={y + 4}
                  width={RESIZE_HANDLE_W} height={h - 8}
                  rx={2}
                  className="mge-block-resize-handle"
                  onPointerDown={(e) => onResizePointerDown(itemIdx, colStart, colSpan, e)}
                />
              </g>
            );
          }

          if (item.type === "block") {
            const rx = shapeRx(item);
            const shapeVariant = shapeClass(item);
            const label = item.label ?? item.id;

            return (
              <g
                key={itemIdx}
                className={[
                  "mge-block-cell",
                  `mge-block-cell-${shapeVariant}`,
                  isSelected ? "mge-block-cell-selected" : "",
                  isDragSrc ? "mge-block-cell-dragging" : "",
                  isDropTarget ? "mge-block-cell-droptarget" : "",
                  isResizing ? "mge-block-cell-resizing" : "",
                ].filter(Boolean).join(" ")}
                style={{ cursor: "grab" }}
                onPointerDown={(e) => onBlockPointerDown(itemIdx, e)}
              >
                <rect
                  x={x} y={y} width={w} height={h}
                  rx={shapeVariant === "circle" || shapeVariant === "rounded" ? Math.min(rx, h / 2) : rx}
                  className="mge-block-cell-rect"
                />
                {/* cylinder top ellipse */}
                {shapeVariant === "cylinder" ? (
                  <ellipse
                    cx={x + w / 2} cy={y + 6}
                    rx={w / 2 - 1} ry={5}
                    className="mge-block-cell-cylinder-cap"
                  />
                ) : null}
                {/* ribbon arrow on left */}
                {shapeVariant === "ribbon" ? (
                  <polyline
                    points={`${x},${y} ${x - 8},${y + h / 2} ${x},${y + h}`}
                    className="mge-block-cell-ribbon-arrow"
                    fill="none"
                  />
                ) : null}
                <text
                  x={x + w / 2}
                  y={y + h / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="mge-block-cell-label"
                >
                  {label}
                </text>
                {/* Selection ring */}
                {isSelected ? (
                  <rect
                    x={x - 2} y={y - 2}
                    width={w + 4} height={h + 4}
                    rx={shapeVariant === "circle" || shapeVariant === "rounded" ? Math.min(rx, h / 2) + 2 : rx + 2}
                    className="mge-block-cell-selection-ring"
                  />
                ) : null}
                {/* Resize handle */}
                <rect
                  x={x + w - RESIZE_HANDLE_W} y={y + 4}
                  width={RESIZE_HANDLE_W} height={h - 8}
                  rx={2}
                  className="mge-block-resize-handle"
                  onPointerDown={(e) => onResizePointerDown(itemIdx, colStart, colSpan, e)}
                />
              </g>
            );
          }

          return null;
        })}

        {/* Drop indicator overlay */}
        {dragOver !== null && (() => {
          const target = cells.find((c) => c.itemIdx === dragOver);
          if (!target) return null;
          const x = PAD + (target.colStart - 1) * (CELL_W + GAP);
          const y = PAD + (target.row - 1) * (CELL_H + GAP);
          const w = target.colSpan * CELL_W + (target.colSpan - 1) * GAP;
          return (
            <rect
              x={x - 3} y={y - 3}
              width={w + 6} height={CELL_H + 6}
              rx={4}
              className="mge-block-drop-indicator"
              style={{ pointerEvents: "none" }}
            />
          );
        })()}
      </svg>
      <p className="mge-block-preview-help">
        クリックで選択 · ドラッグで並べ替え · 右端ハンドルでスパン変更 · Delete/Backspace で削除
      </p>
    </div>
  );
};
