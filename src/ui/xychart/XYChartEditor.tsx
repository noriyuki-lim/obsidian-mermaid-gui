import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { parseXYChart } from "../../core/xychart/parser";
import { generateXYChart } from "../../core/xychart/generator";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import { useT } from "../EditorHostContext";
import type {
  XYAxis,
  XYChartIR,
  XYItem,
  XYOrientation,
  XYSeriesKind,
} from "../../core/xychart/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

// ──────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────

const seed = (initialSource: string): XYChartIR => {
  const outcome = parseXYChart(initialSource);
  if (outcome.ok) return outcome.ir;
  return { kind: "xychart-beta", orientation: "vertical", items: [] };
};

/** Extract categories from the xAxis (categorical) or return an empty array. */
const getCategories = (ir: XYChartIR): string[] => {
  if (ir.xAxis?.kind === "categorical") return ir.xAxis.categories;
  return [];
};

/** Extract only the series items (no raw items) in order. */
const getSeries = (items: XYItem[]): Array<{ index: number; series: XYSeriesKind; values: number[] }> => {
  const out: Array<{ index: number; series: XYSeriesKind; values: number[] }> = [];
  items.forEach((item, index) => {
    if (item.type === "series") out.push({ index, series: item.series, values: item.values });
  });
  return out;
};

type XYCell = { row: number; col: number };

/**
 * Resolve which category row (by position — see the `cat-${row}` /
 * `data-xy-row` key note on the category loop below) the pointer currently
 * sits over, via the closest `[data-xy-row]` ancestor. Shared by the
 * preview's SVG drag handle and the table's row drag handle so both resolve
 * drop targets the same way (mirrors gantt's `targetRowFromPoint`).
 */
const xyRowFromPoint = (clientX: number, clientY: number): number | null => {
  const el = document.elementFromPoint(clientX, clientY);
  const rowEl = el?.closest<Element>("[data-xy-row]");
  const raw = rowEl?.getAttribute("data-xy-row");
  if (raw === null || raw === undefined) return null;
  const index = Number(raw);
  return Number.isFinite(index) ? index : null;
};

interface XYPreviewProps {
  ir: XYChartIR;
  categories: string[];
  seriesList: Array<{ index: number; series: XYSeriesKind; values: number[] }>;
  onCategoryChange: (row: number, value: string) => void;
  onValueChange: (itemIndex: number, row: number, value: number) => void;
  onReorderCategory: (from: number, to: number) => void;
}

const niceDomain = (ir: XYChartIR, seriesList: Array<{ values: number[] }>) => {
  if (ir.yAxis?.kind === "numeric") return { min: ir.yAxis.min, max: ir.yAxis.max };
  const values = seriesList.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  if (values.length === 0) return { min: 0, max: 100 };
  const min = Math.min(0, ...values);
  const max = Math.max(...values, 1);
  const pad = Math.max(1, (max - min) * 0.12);
  return { min, max: max + pad };
};

const XYChartInteractivePreview = ({
  ir,
  categories,
  seriesList,
  onCategoryChange,
  onValueChange,
  onReorderCategory,
}: XYPreviewProps) => {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerId: number; itemIndex: number; row: number } | null>(null);
  const rowDragRef = useRef<{ pointerId: number; currentIndex: number } | null>(null);
  const [editingCategory, setEditingCategory] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState<{ itemIndex: number; row: number } | null>(null);
  const [draggingRow, setDraggingRow] = useState<number | null>(null);

  const isHorizontal = ir.orientation === "horizontal";
  const width = 960;
  const height = 320;
  // Margins swap emphasis by orientation: horizontal mode needs a wide left
  // gutter for (right-aligned) category labels and only a shallow bottom
  // gutter for the value scale; vertical mode is the reverse.
  const left = isHorizontal ? 128 : 62;
  const right = 24;
  const top = 28;
  const bottom = isHorizontal ? 40 : 54;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const rows = Math.max(categories.length, ...seriesList.map((s) => s.values.length), 1);
  const domain = niceDomain(ir, seriesList);
  const span = Math.max(1, domain.max - domain.min);
  const barSeries = seriesList.filter((s) => s.series === "bar");
  const lineSeries = seriesList.filter((s) => s.series === "line");

  // ── orientation-independent coordinate helpers ──────────────────────
  // The category axis is x in vertical mode and y in horizontal mode; the
  // value axis is the other one. Every shape below is built from these two
  // helpers so the JSX itself doesn't need a separate vertical/horizontal copy.
  const categoryAxisSize = isHorizontal ? plotH : plotW;
  const band = categoryAxisSize / rows;
  /** Pixel coordinate (along whichever screen axis represents categories) for the center of row N. */
  const categoryCenter = (row: number) => (isHorizontal ? top : left) + row * band + band / 2;
  /** Pixel coordinate (along whichever screen axis represents values) for a given value. */
  const valueCoord = (value: number) => {
    const ratio = (value - domain.min) / span;
    return isHorizontal ? left + ratio * plotW : top + (1 - ratio) * plotH;
  };
  /** Map a (row, value) pair to a screen point, respecting orientation. */
  const pointFor = (row: number, value: number) => {
    const c = categoryCenter(row);
    const v = valueCoord(value);
    return isHorizontal ? { x: v, y: c } : { x: c, y: v };
  };

  const svgXForClient = (clientX: number): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    return ((clientX - rect.left) / rect.width) * width;
  };
  const svgYForClient = (clientY: number): number | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return null;
    return ((clientY - rect.top) / rect.height) * height;
  };
  /**
   * Convert a pointer position into the dragged value, snapped to whole
   * units (free-form decimals are still reachable via double-click → the
   * number input). A value's on-screen position only ever moves along the
   * value axis, so the input axis follows orientation: horizontal charts
   * read clientX, vertical charts read clientY.
   */
  const valueForClient = (client: { clientX: number; clientY: number }): number | null => {
    if (isHorizontal) {
      const x = svgXForClient(client.clientX);
      if (x === null) return null;
      const ratio = Math.min(Math.max((x - left) / plotW, 0), 1);
      return Math.round(domain.min + ratio * span);
    }
    const y = svgYForClient(client.clientY);
    if (y === null) return null;
    const ratio = 1 - Math.min(Math.max((y - top) / plotH, 0), 1);
    return Math.round(domain.min + ratio * span);
  };

  const beginDrag = (itemIndex: number, row: number, event: ReactPointerEvent<Element>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, itemIndex, row };
  };

  // Dragging anywhere on a bar or line point changes its value; double-click
  // anywhere on either opens the value input for exact/decimal entry.
  const startBarDrag = (itemIndex: number, row: number) => (event: ReactPointerEvent<SVGRectElement>) => {
    if (event.button !== 0) return;
    beginDrag(itemIndex, row, event);
  };

  const startPointDrag = (itemIndex: number, row: number) => (event: ReactPointerEvent<SVGCircleElement>) => {
    if (event.button !== 0) return;
    beginDrag(itemIndex, row, event);
  };

  /**
   * Category (row) reorder drag, started from the dot-grip handle beside
   * each category label. The dragged category's rows array position is
   * `cat-${row}` keyed (position-based, not a stable id — see the render
   * loop below), so the DOM node this pointer capture is set on keeps
   * representing "whichever category is at this slot" for the whole drag;
   * React never unmounts/remounts it mid-drag, so plain `setPointerCapture`
   * survives every swap (same reasoning gantt's row-drag handle relies on).
   */
  const startRowDrag = (row: number) => (event: ReactPointerEvent<SVGGElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    rowDragRef.current = { pointerId: event.pointerId, currentIndex: row };
    setDraggingRow(row);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const rowDrag = rowDragRef.current;
    if (rowDrag && rowDrag.pointerId === event.pointerId) {
      const target = xyRowFromPoint(event.clientX, event.clientY);
      if (target !== null && target !== rowDrag.currentIndex) {
        onReorderCategory(rowDrag.currentIndex, target);
        rowDrag.currentIndex = target;
        setDraggingRow(target);
      }
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const value = valueForClient(event);
    if (value !== null) onValueChange(drag.itemIndex, drag.row, value);
  };

  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (rowDragRef.current?.pointerId === event.pointerId) {
      rowDragRef.current = null;
      setDraggingRow(null);
    }
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  return (
    <div className="mge-xy-preview">
      <svg
        ref={svgRef}
        className="mge-xy-preview-svg"
        viewBox={`0 0 ${width} ${height}`}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <rect x={0} y={0} width={width} height={height} className="mge-xy-preview-bg" />
        {ir.title ? <text x={left} y={18} className="mge-xy-preview-title">{ir.title}</text> : null}
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const value = domain.min + ratio * span;
          const pos = valueCoord(value);
          const label = Math.round(value * 100) / 100;
          return isHorizontal ? (
            <g key={ratio}>
              <line x1={pos} y1={top} x2={pos} y2={top + plotH} className="mge-xy-grid" />
              <text x={pos} y={top + plotH + 16} className="mge-xy-axis-label" textAnchor="middle">
                {label}
              </text>
            </g>
          ) : (
            <g key={ratio}>
              <line x1={left} y1={pos} x2={width - right} y2={pos} className="mge-xy-grid" />
              <text x={left - 8} y={pos + 4} className="mge-xy-axis-label" textAnchor="end">
                {label}
              </text>
            </g>
          );
        })}
        <line x1={left} y1={top} x2={left} y2={top + plotH} className="mge-xy-axis" />
        <line x1={left} y1={top + plotH} x2={width - right} y2={top + plotH} className="mge-xy-axis" />

        {Array.from({ length: rows }, (_, row) => {
          const center = categoryCenter(row);
          const label = categories[row] ?? `x${row + 1}`;
          // Handle sits beside the label, wherever that label currently is:
          // just below it in vertical mode (labels run along the bottom),
          // in the left gutter in horizontal mode (labels are right-aligned
          // there). The passive hit-rect spans the whole cross-axis so a
          // drag anywhere in this category's band resolves to this row via
          // `xyRowFromPoint`, not just when the cursor is over the label text.
          const handlePos = isHorizontal ? { x: 14, y: center } : { x: center, y: height - 9 };
          const hitRect = isHorizontal
            ? { x: 0, y: center - band / 2, width, height: band }
            : { x: center - band / 2, y: 0, width: band, height };
          return (
            <g
              key={`cat-${row}`}
              data-xy-row={row}
              className={`mge-xy-category-row ${draggingRow === row ? "dragging" : ""}`}
            >
              <rect {...hitRect} className="mge-xy-row-hit" />
              {editingCategory === row ? (
                <foreignObject
                  x={isHorizontal ? 4 : center - 54}
                  y={isHorizontal ? center - 14 : height - 42}
                  width={isHorizontal ? left - 12 : 108}
                  height={28}
                >
                  <input
                    className="mge-xy-inline-input"
                    value={categories[row] ?? ""}
                    autoFocus
                    onChange={(event) => onCategoryChange(row, event.target.value)}
                    onBlur={() => setEditingCategory(null)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === "Escape") setEditingCategory(null);
                    }}
                  />
                </foreignObject>
              ) : (
                <text
                  x={isHorizontal ? left - 8 : center}
                  y={isHorizontal ? center + 4 : height - 26}
                  className="mge-xy-axis-label mge-xy-category-label"
                  textAnchor={isHorizontal ? "end" : "middle"}
                  onDoubleClick={() => setEditingCategory(row)}
                >
                  {label}
                </text>
              )}
              <g
                className="mge-xy-row-handle-group"
                transform={`translate(${handlePos.x}, ${handlePos.y})`}
                onPointerDown={startRowDrag(row)}
                aria-label={t.xychart.reorderCategory}
              >
                <rect x={-8} y={-9} width={16} height={18} className="mge-xy-row-hit" />
                {[0, 1].map((dotRow) => (
                  <g key={dotRow}>
                    <circle cx={-2} cy={-3 + dotRow * 5} r={1.1} className="mge-xy-row-grip-dot" />
                    <circle cx={2} cy={-3 + dotRow * 5} r={1.1} className="mge-xy-row-grip-dot" />
                  </g>
                ))}
              </g>
            </g>
          );
        })}

        {barSeries.map((series, barIdx) => {
          const barThickness = Math.min(42, Math.max(12, (band * 0.72) / Math.max(barSeries.length, 1)));
          return series.values.map((value, row) => {
            const crossStart = categoryCenter(row) - (barThickness * barSeries.length) / 2 + barIdx * barThickness;
            const v0 = valueCoord(0);
            const v1 = valueCoord(value);
            const boxStart = Math.min(v0, v1);
            const boxLength = Math.max(2, Math.abs(v1 - v0));
            const rectBox = isHorizontal
              ? { x: boxStart, y: crossStart, width: boxLength, height: barThickness - 3 }
              : { x: crossStart, y: boxStart, width: barThickness - 3, height: boxLength };
            const crossCenter = crossStart + (barThickness - 3) / 2;
            const editorPos = isHorizontal
              ? { x: Math.min(width - right - 76, Math.max(v0, v1) + 8), y: crossCenter - 14 }
              : { x: crossCenter - 36, y: Math.max(4, boxStart - 30) };
            return (
              <g key={`${series.index}-${row}`}>
                <rect
                  {...rectBox}
                  rx={3}
                  className="mge-xy-bar"
                  onPointerDown={startBarDrag(series.index, row)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    setEditingValue({ itemIndex: series.index, row });
                  }}
                />
                {editingValue?.itemIndex === series.index && editingValue.row === row ? (
                  <foreignObject x={editorPos.x} y={editorPos.y} width={72} height={28}>
                    <input
                      className="mge-xy-inline-input"
                      type="number"
                      value={value}
                      autoFocus
                      onChange={(event) => onValueChange(series.index, row, Number(event.target.value))}
                      onBlur={() => setEditingValue(null)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === "Escape") setEditingValue(null);
                      }}
                    />
                  </foreignObject>
                ) : null}
              </g>
            );
          });
        })}

        {lineSeries.map((series, lineIdx) => {
          const points = series.values.map((value, row) => ({
            ...pointFor(row, value),
            value,
            row,
          }));
          return (
            <g key={`line-${series.index}`} className={`mge-xy-line-series series-${lineIdx % 4}`}>
              <polyline
                points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                className="mge-xy-line"
              />
              {points.map((p) => (
                <g key={p.row}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={4}
                    className="mge-xy-point"
                    onPointerDown={startPointDrag(series.index, p.row)}
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      setEditingValue({ itemIndex: series.index, row: p.row });
                    }}
                  />
                  {editingValue?.itemIndex === series.index && editingValue.row === p.row ? (
                    <foreignObject
                      x={isHorizontal ? Math.min(width - right - 76, p.x + 12) : p.x - 36}
                      y={isHorizontal ? p.y - 14 : Math.max(4, p.y - 34)}
                      width={72}
                      height={28}
                    >
                      <input
                        className="mge-xy-inline-input"
                        type="number"
                        value={p.value}
                        autoFocus
                        onChange={(event) => onValueChange(series.index, p.row, Number(event.target.value))}
                        onBlur={() => setEditingValue(null)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === "Escape") setEditingValue(null);
                        }}
                      />
                    </foreignObject>
                  ) : null}
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <p className="mge-xy-preview-help">{t.xychart.helpText}</p>
    </div>
  );
};

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export const XYChartEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const t = useT();
  const [ir, setIr] = useState<XYChartIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);
  const [selectedCell, setSelectedCell] = useState<XYCell>({ row: 0, col: 0 });
  const [editMode, setEditMode] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);

  // ── derived views ──────────────────────────
  const categories = useMemo(() => getCategories(ir), [ir]);
  const seriesList = useMemo(() => getSeries(ir.items), [ir]);
  const rowCount = useMemo(() => {
    // rows = max(categories.length, max series values.length)
    let max = categories.length;
    seriesList.forEach(s => { if (s.values.length > max) max = s.values.length; });
    return max;
  }, [categories, seriesList]);

  // ── IR mutation helpers ────────────────────

  /** Update xAxis categories array. */
  const setCategories = (cats: string[]) => {
    setIr(prev => ({
      ...prev,
      xAxis: prev.xAxis?.kind === "categorical"
        ? { ...prev.xAxis, categories: cats }
        : { kind: "categorical", categories: cats },
    }));
  };

  const setCategoryAt = useCallback((row: number, value: string) => {
    const next = [...categories];
    while (next.length <= row) next.push("");
    next[row] = value;
    setCategories(next);
  }, [categories]);

  /** Update the values of series at items-array index `itemIdx`. */
  const setSeriesValues = (itemIdx: number, values: number[]) => {
    setIr(prev => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === itemIdx ? { ...item, values } as XYItem : item,
      ),
    }));
  };

  const setSeriesValueAt = useCallback((itemIdx: number, row: number, value: number) => {
    const series = seriesList.find((s) => s.index === itemIdx);
    const next = series ? [...series.values] : [];
    while (next.length <= row) next.push(0);
    next[row] = Number.isFinite(value) ? value : 0;
    setSeriesValues(itemIdx, next);
  }, [seriesList]);

  /** Toggle bar/line for the series at items-array index `itemIdx`. */
  const setSeriesKind = (itemIdx: number, kind: XYSeriesKind) => {
    setIr(prev => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === itemIdx && item.type === "series"
          ? ({ ...item, series: kind } as XYItem)
          : item,
      ),
    }));
  };

  /** Add a new series column (bar by default). */
  const addSeries = () => {
    setIr(prev => ({
      ...prev,
      items: [
        ...prev.items,
        { type: "series", series: "bar" as XYSeriesKind, values: new Array(rowCount).fill(0) },
      ],
    }));
  };

  /** Delete a series column (by items-array index). */
  const deleteSeries = (itemIdx: number) => {
    setIr(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== itemIdx) }));
  };

  /** Add a new x-category row. */
  const addRow = () => {
    const newCats = [...categories, `x${rowCount + 1}`];
    setIr(prev => ({
      ...prev,
      xAxis: prev.xAxis?.kind === "categorical"
        ? { ...prev.xAxis, categories: newCats }
        : { kind: "categorical", categories: newCats },
      items: prev.items.map(item =>
        item.type === "series"
          ? { ...item, values: [...item.values, 0] }
          : item,
      ),
    }));
  };

  /** Delete the row at position `rowIdx`. */
  const deleteRow = (rowIdx: number) => {
    const newCats = categories.filter((_, i) => i !== rowIdx);
    setIr(prev => ({
      ...prev,
      xAxis: prev.xAxis?.kind === "categorical"
        ? { ...prev.xAxis, categories: newCats }
        : newCats.length > 0 ? { kind: "categorical", categories: newCats } : undefined,
      items: prev.items.map(item =>
        item.type === "series"
          ? { ...item, values: item.values.filter((_, i) => i !== rowIdx) }
          : item,
      ),
    }));
  };

  /** Move the element at `from` to `to`, padding with `fill` first if needed
   * (mirrors gantt's `reorderItem` splice pattern: `splice(from,1)` then
   * `splice(to,0,item)`). */
  const spliceMove = <T,>(arr: T[], from: number, to: number, fill: T): T[] => {
    const next = arr.slice();
    while (next.length <= Math.max(from, to)) next.push(fill);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
  };

  /**
   * Reorder an entire category row: the category label at `categories[from]`
   * AND `values[from]` for every series move together to `to`, keeping row
   * alignment intact. `categories` / `seriesList` are derived views recomputed
   * from `ir` each render, so this mutates `ir` directly via `setIr` rather
   * than operating on those derived arrays.
   */
  const reorderCategory = useCallback((from: number, to: number) => {
    setIr(prev => {
      const catLen = prev.xAxis?.kind === "categorical" ? prev.xAxis.categories.length : 0;
      const seriesLen = prev.items.reduce(
        (max, item) => (item.type === "series" ? Math.max(max, item.values.length) : max),
        0,
      );
      const rowBound = Math.max(catLen, seriesLen, 1);
      if (from === to || from < 0 || to < 0 || from >= rowBound || to >= rowBound) return prev;

      const xAxis = prev.xAxis?.kind === "categorical"
        ? { ...prev.xAxis, categories: spliceMove(prev.xAxis.categories, from, to, "") }
        : prev.xAxis;
      const items = prev.items.map(item =>
        item.type === "series" ? { ...item, values: spliceMove(item.values, from, to, 0) } : item,
      );
      return { ...prev, xAxis, items };
    });
  }, []);

  const tableRowDragRef = useRef<{ pointerId: number; currentIndex: number } | null>(null);
  const [tableDraggingRow, setTableDraggingRow] = useState<number | null>(null);

  const startTableRowDrag = (rowIdx: number) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    tableRowDragRef.current = { pointerId: event.pointerId, currentIndex: rowIdx };
    setTableDraggingRow(rowIdx);
  };

  const moveTableRowDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = tableRowDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const target = xyRowFromPoint(event.clientX, event.clientY);
    if (target === null || target === drag.currentIndex) return;
    reorderCategory(drag.currentIndex, target);
    drag.currentIndex = target;
    setTableDraggingRow(target);
  };

  const endTableRowDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!tableRowDragRef.current || tableRowDragRef.current.pointerId !== event.pointerId) return;
    tableRowDragRef.current = null;
    setTableDraggingRow(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // pointer capture may already be released
    }
  };

  /** Handle paste (TSV) into any table cell. */
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return; // not TSV
    e.preventDefault();

    const rows = text.trimEnd().split(/\r?\n/).map(r => r.split("\t"));
    setIr(prev => {
      const cats = prev.xAxis?.kind === "categorical" ? prev.xAxis.categories.slice() : [];
      const items = prev.items.slice();
      const existingSeries = items
        .map((item, index) => ({ item, index }))
        .filter((entry): entry is { item: Extract<XYItem, { type: "series" }>; index: number } => entry.item.type === "series");

      rows.forEach((cells, r) => {
        const row = selectedCell.row + r;
        cells.forEach((cell, c) => {
          const col = selectedCell.col + c;
          if (col === 0) {
            while (cats.length <= row) cats.push("");
            cats[row] = cell;
            return;
          }
          const seriesCol = col - 1;
          let target = existingSeries[seriesCol];
          if (!target) {
            const item: XYItem = { type: "series", series: "bar", values: [] };
            items.push(item);
            target = { item, index: items.length - 1 };
            existingSeries[seriesCol] = target;
          }
          const values = target.item.values.slice();
          while (values.length <= row) values.push(0);
          const n = Number(cell.trim());
          values[row] = Number.isFinite(n) ? n : 0;
          items[target.index] = { ...target.item, values };
          target.item = items[target.index] as Extract<XYItem, { type: "series" }>;
        });
      });

      return { ...prev, xAxis: { kind: "categorical", categories: cats }, items };
    });
  }, [selectedCell]);

  // ── y-axis helpers ─────────────────────────

  const yAutoEnabled = !ir.yAxis || ir.yAxis.kind === "label-only";
  const yTitle = ir.yAxis?.kind === "label-only" ? ir.yAxis.title
    : ir.yAxis?.kind === "numeric" ? (ir.yAxis.title ?? "")
    : "";
  const yMin = ir.yAxis?.kind === "numeric" ? ir.yAxis.min : 0;
  const yMax = ir.yAxis?.kind === "numeric" ? ir.yAxis.max : 100;

  const setYAxis = (patch: { auto?: boolean; title?: string; min?: number; max?: number }) => {
    setIr(prev => {
      const prevY = prev.yAxis;
      const auto = patch.auto ?? yAutoEnabled;
      const title = patch.title !== undefined ? patch.title : yTitle;
      const min = patch.min !== undefined ? patch.min : yMin;
      const max = patch.max !== undefined ? patch.max : yMax;
      if (auto) {
        const newY: XYAxis | undefined = title
          ? { kind: "label-only", title }
          : undefined;
        return { ...prev, yAxis: newY };
      }
      return {
        ...prev,
        yAxis: {
          kind: "numeric",
          title: title || undefined,
          min,
          max,
          ...(prevY?.kind === "numeric" ? {} : {}),
        } as XYAxis,
      };
    });
  };

  // ── EditorShell contract ───────────────────

  const currentSource = useMemo(() => generateXYChart(ir), [ir]);

  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const outcome = parseXYChart(next);
    if (!outcome.ok) return { ok: false, error: outcome.message };
    setIr(outcome.ir);
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

  const focusXYCell = (row: number, col: number) => {
    const maxRow = Math.max(0, rowCount - 1);
    const maxCol = seriesList.length;
    const next = {
      row: Math.min(Math.max(row, 0), maxRow),
      col: Math.min(Math.max(col, 0), maxCol),
    };
    setSelectedCell(next);
    window.setTimeout(() => {
      const input = tableRef.current?.querySelector<HTMLInputElement>(
        `[data-xy-cell="${next.row}:${next.col}"]`,
      );
      input?.focus();
      input?.select();
    }, 0);
  };

  const onXYCellKeyDown = (row: number, col: number) => (event: KeyboardEvent<HTMLInputElement>) => {
    setSelectedCell({ row, col });
    if (event.key === "F2") {
      event.preventDefault();
      setEditMode((mode) => !mode);
      return;
    }
    if (editMode && (event.key === "ArrowLeft" || event.key === "ArrowRight")) return;
    if (editMode && col > 0 && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      const series = seriesList[col - 1];
      const current = series?.values[row] ?? 0;
      setSeriesValueAt(series.index, row, current + (event.key === "ArrowUp" ? 1 : -1));
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const delta = event.shiftKey ? -1 : 1;
      const flat = row * (seriesList.length + 1) + col + delta;
      const maxFlat = Math.max(0, rowCount * (seriesList.length + 1) - 1);
      const next = Math.min(Math.max(flat, 0), maxFlat);
      focusXYCell(Math.floor(next / (seriesList.length + 1)), next % (seriesList.length + 1));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusXYCell(row, col + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusXYCell(row, col - 1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      focusXYCell(row + 1, col);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusXYCell(row - 1, col);
    }
  };

  // ── render ─────────────────────────────────

  return (
    <EditorShell
      diagramKind="xychart-beta"
      currentSource={currentSource}
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      renderMermaid={renderMermaid}
      onSourceEdit={handleSourceEdit}
      layout="stacked"
      sourceToggleLabel={t.common.showSource}
      previewOverride={
        <XYChartInteractivePreview
          ir={ir}
          categories={categories}
          seriesList={seriesList}
          onCategoryChange={setCategoryAt}
          onValueChange={setSeriesValueAt}
          onReorderCategory={reorderCategory}
        />
      }
    >
      <div className={`mge-xy-body ${editMode ? "mge-xy-edit-mode" : ""}`}>
        {/* ── header fields ───────────────── */}
        <div className="mge-xy-header-fields">
          <label className="mge-xy-field-row">
            <span className="mge-xy-field-label">title</span>
            <input
              className="mge-xy-input mge-xy-input-wide"
              value={ir.title ?? ""}
              onChange={e => setIr(prev => ({ ...prev, title: e.target.value || undefined }))}
              placeholder="(no title)"
            />
          </label>
          <label className="mge-xy-field-row">
            <span className="mge-xy-field-label">orientation</span>
            <select
              className="mge-xy-select"
              value={ir.orientation}
              onChange={e => setIr(prev => ({ ...prev, orientation: e.target.value as XYOrientation }))}
            >
              <option value="vertical">vertical</option>
              <option value="horizontal">horizontal</option>
            </select>
          </label>

          {/* compact y-axis row */}
          <div className="mge-xy-yaxis-row">
            <span className="mge-xy-field-label">y-axis</span>
            <input
              className="mge-xy-input"
              value={yTitle}
              onChange={e => setYAxis({ title: e.target.value })}
              placeholder="label"
              style={{ width: "8rem" }}
            />
            <label className="mge-xy-yaxis-auto">
              <input
                type="checkbox"
                checked={yAutoEnabled}
                onChange={e => setYAxis({ auto: e.target.checked })}
              />
              auto
            </label>
            {!yAutoEnabled && (
              <>
                <span className="mge-xy-field-label">min</span>
                <span className="mge-xy-num-field">
                  <input
                    className="mge-xy-input mge-xy-input-num"
                    type="number"
                    step="any"
                    value={yMin}
                    onChange={e => setYAxis({ min: Number(e.target.value) })}
                  />
                  <span className="mge-xy-num-stepper">
                    <button
                      type="button"
                      className="mge-xy-num-stepper-btn"
                      aria-label={t.xychart.increaseYMin}
                      onClick={() => setYAxis({ min: yMin + 1 })}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="mge-xy-num-stepper-btn"
                      aria-label={t.xychart.decreaseYMin}
                      onClick={() => setYAxis({ min: yMin - 1 })}
                    >
                      ▼
                    </button>
                  </span>
                </span>
                <span className="mge-xy-field-label">max</span>
                <span className="mge-xy-num-field">
                  <input
                    className="mge-xy-input mge-xy-input-num"
                    type="number"
                    step="any"
                    value={yMax}
                    onChange={e => setYAxis({ max: Number(e.target.value) })}
                  />
                  <span className="mge-xy-num-stepper">
                    <button
                      type="button"
                      className="mge-xy-num-stepper-btn"
                      aria-label={t.xychart.increaseYMax}
                      onClick={() => setYAxis({ max: yMax + 1 })}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="mge-xy-num-stepper-btn"
                      aria-label={t.xychart.decreaseYMax}
                      onClick={() => setYAxis({ max: yMax - 1 })}
                    >
                      ▼
                    </button>
                  </span>
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── data table ──────────────────── */}
        <div className="mge-xy-table-wrap" onPaste={handlePaste}>
          <table className="mge-xy-table" ref={tableRef}>
            <thead>
              <tr>
                {/* x-category col header */}
                <th className="mge-xy-th mge-xy-th-cat">
                  <span className="mge-xy-th-label">x categories</span>
                </th>
                {/* series col headers */}
                {seriesList.map((s, colIdx) => (
                  <th key={s.index} className="mge-xy-th mge-xy-th-series">
                    <div className="mge-xy-th-series-inner">
                      <span className="mge-xy-col-label">{t.xychart.seriesLabel(colIdx + 1)}</span>
                      <select
                        className="mge-xy-kind-select"
                        value={s.series}
                        onChange={e => setSeriesKind(s.index, e.target.value as XYSeriesKind)}
                        title="bar / line"
                      >
                        <option value="bar">bar</option>
                        <option value="line">line</option>
                      </select>
                      <button
                        className="mge-xy-del-btn"
                        onClick={() => deleteSeries(s.index)}
                        aria-label={t.xychart.deleteSeries(colIdx + 1)}
                      >
                        ×
                      </button>
                    </div>
                  </th>
                ))}
                {/* add-series column */}
                <th className="mge-xy-th mge-xy-th-add">
                  <button
                    className="mge-xy-add-btn"
                    onClick={addSeries}
                    aria-label={t.xychart.addSeries}
                  >
                    +
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {Array.from({ length: rowCount }, (_, rowIdx) => (
                <tr
                  key={rowIdx}
                  className={`mge-xy-row ${tableDraggingRow === rowIdx ? "dragging" : ""}`}
                  data-xy-row={rowIdx}
                >
                  {/* category cell */}
                  <td className="mge-xy-td mge-xy-td-cat">
                    <span className="mge-xy-td-cat-inner">
                      <button
                        className="mge-xy-table-row-handle"
                        type="button"
                        aria-label={t.xychart.reorderCategory}
                        onPointerDown={startTableRowDrag(rowIdx)}
                        onPointerMove={moveTableRowDrag}
                        onPointerUp={endTableRowDrag}
                        onPointerCancel={endTableRowDrag}
                      >
                        <span className="mge-xy-table-grip" aria-hidden="true" />
                      </button>
                      <input
                        data-xy-cell={`${rowIdx}:0`}
                        className="mge-xy-input mge-xy-input-cat"
                        value={categories[rowIdx] ?? ""}
                        onFocus={() => setSelectedCell({ row: rowIdx, col: 0 })}
                        onKeyDown={onXYCellKeyDown(rowIdx, 0)}
                        onChange={e => {
                          setCategoryAt(rowIdx, e.target.value);
                        }}
                        placeholder={t.xychart.rowPlaceholder(rowIdx + 1)}
                      />
                      <button
                        className="mge-xy-del-row-btn"
                        onClick={() => deleteRow(rowIdx)}
                        aria-label={t.xychart.deleteRow(rowIdx + 1)}
                      >
                        ×
                      </button>
                    </span>
                  </td>
                  {/* value cells */}
                  {seriesList.map((s, colIdx) => {
                    const cellValue = s.values[rowIdx] ?? 0;
                    return (
                      <td key={s.index} className="mge-xy-td mge-xy-td-val">
                        <span className="mge-xy-num-field">
                          <input
                            data-xy-cell={`${rowIdx}:${colIdx + 1}`}
                            className="mge-xy-input mge-xy-input-num"
                            type="number"
                            step="any"
                            value={cellValue}
                            onFocus={() => setSelectedCell({ row: rowIdx, col: colIdx + 1 })}
                            onKeyDown={onXYCellKeyDown(rowIdx, colIdx + 1)}
                            onChange={e => {
                              setSeriesValueAt(s.index, rowIdx, Number(e.target.value));
                            }}
                          />
                          <span className="mge-xy-num-stepper">
                            <button
                              type="button"
                              className="mge-xy-num-stepper-btn"
                              aria-label={t.xychart.increaseValue}
                              onClick={() => setSeriesValueAt(s.index, rowIdx, cellValue + 1)}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              className="mge-xy-num-stepper-btn"
                              aria-label={t.xychart.decreaseValue}
                              onClick={() => setSeriesValueAt(s.index, rowIdx, cellValue - 1)}
                            >
                              ▼
                            </button>
                          </span>
                        </span>
                      </td>
                    );
                  })}
                  {/* empty cell under add-series col */}
                  <td className="mge-xy-td mge-xy-td-add" />
                </tr>
              ))}

              {/* "add row" footer row */}
              <tr className="mge-xy-row-add">
                <td className="mge-xy-td" colSpan={seriesList.length + 2}>
                  <button
                    className="mge-xy-add-row-btn"
                    onClick={addRow}
                    aria-label={t.xychart.addRow}
                  >
                    {t.xychart.addRowButton}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <p className="mge-xy-paste-hint">{t.xychart.pasteHint}</p>
        </div>

        {/* raw items (preserved, read-only) */}
        {ir.items.some(i => i.type === "raw") && (
          <div className="mge-xy-raw-section">
            <span className="mge-xy-raw-label">raw lines (preserved)</span>
            {ir.items
              .filter(i => i.type === "raw")
              .map((item, idx) => (
                <code key={idx} className="mge-xy-raw-line">
                  {(item as { type: "raw"; line: string }).line.trim()}
                </code>
              ))}
          </div>
        )}
      </div>
    </EditorShell>
  );
};
