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

interface XYPreviewProps {
  ir: XYChartIR;
  categories: string[];
  seriesList: Array<{ index: number; series: XYSeriesKind; values: number[] }>;
  onCategoryChange: (row: number, value: string) => void;
  onValueChange: (itemIndex: number, row: number, value: number) => void;
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
}: XYPreviewProps) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ pointerId: number; itemIndex: number; row: number } | null>(null);
  const [editingCategory, setEditingCategory] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState<{ itemIndex: number; row: number } | null>(null);

  const width = 960;
  const height = 320;
  const left = 62;
  const right = 24;
  const top = 28;
  const bottom = 54;
  const plotW = width - left - right;
  const plotH = height - top - bottom;
  const rows = Math.max(categories.length, ...seriesList.map((s) => s.values.length), 1);
  const domain = niceDomain(ir, seriesList);
  const span = Math.max(1, domain.max - domain.min);
  const band = plotW / rows;
  const barSeries = seriesList.filter((s) => s.series === "bar");
  const lineSeries = seriesList.filter((s) => s.series === "line");
  const yFor = (value: number) => top + (1 - (value - domain.min) / span) * plotH;
  const valueForClient = (clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return null;
    const y = ((clientY - rect.top) / rect.height) * height;
    const ratio = 1 - Math.min(Math.max((y - top) / plotH, 0), 1);
    const raw = domain.min + ratio * span;
    return Math.round(raw * 100) / 100;
  };

  const startBarDrag = (itemIndex: number, row: number) => (event: ReactPointerEvent<SVGRectElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, itemIndex, row };
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const value = valueForClient(event.clientY);
    if (value !== null) onValueChange(drag.itemIndex, drag.row, value);
  };

  const finishDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
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
          const y = top + ratio * plotH;
          const value = domain.max - ratio * span;
          return (
            <g key={ratio}>
              <line x1={left} y1={y} x2={width - right} y2={y} className="mge-xy-grid" />
              <text x={left - 8} y={y + 4} className="mge-xy-axis-label" textAnchor="end">
                {Math.round(value * 100) / 100}
              </text>
            </g>
          );
        })}
        <line x1={left} y1={top} x2={left} y2={top + plotH} className="mge-xy-axis" />
        <line x1={left} y1={top + plotH} x2={width - right} y2={top + plotH} className="mge-xy-axis" />

        {Array.from({ length: rows }, (_, row) => {
          const xCenter = left + row * band + band / 2;
          return (
            <g key={`cat-${row}`}>
              {editingCategory === row ? (
                <foreignObject x={xCenter - 54} y={height - 42} width={108} height={28}>
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
                  x={xCenter}
                  y={height - 26}
                  className="mge-xy-axis-label mge-xy-category-label"
                  textAnchor="middle"
                  onDoubleClick={() => setEditingCategory(row)}
                >
                  {categories[row] ?? `x${row + 1}`}
                </text>
              )}
            </g>
          );
        })}

        {barSeries.map((series, barIdx) => {
          const barW = Math.min(42, Math.max(12, (band * 0.72) / Math.max(barSeries.length, 1)));
          return series.values.map((value, row) => {
            const x = left + row * band + band / 2 - (barW * barSeries.length) / 2 + barIdx * barW;
            const y = yFor(value);
            const zero = yFor(0);
            const h = Math.max(2, Math.abs(zero - y));
            const topY = Math.min(y, zero);
            return (
              <g key={`${series.index}-${row}`}>
                <rect
                  x={x}
                  y={topY}
                  width={barW - 3}
                  height={h}
                  rx={3}
                  className="mge-xy-bar"
                  onPointerDown={startBarDrag(series.index, row)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    setEditingValue({ itemIndex: series.index, row });
                  }}
                />
                {editingValue?.itemIndex === series.index && editingValue.row === row ? (
                  <foreignObject x={x - 20} y={Math.max(4, topY - 30)} width={72} height={28}>
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
            x: left + row * band + band / 2,
            y: yFor(value),
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
                    onDoubleClick={() => setEditingValue({ itemIndex: series.index, row: p.row })}
                  />
                  {editingValue?.itemIndex === series.index && editingValue.row === p.row ? (
                    <foreignObject x={p.x - 36} y={Math.max(4, p.y - 34)} width={72} height={28}>
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
      <p className="mge-xy-preview-help">棒をドラッグして値を変更。棒・点・カテゴリ名はダブルクリックで編集。</p>
    </div>
  );
};

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export const XYChartEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
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
      sourceToggleLabel="ソースを表示"
      previewOverride={
        <XYChartInteractivePreview
          ir={ir}
          categories={categories}
          seriesList={seriesList}
          onCategoryChange={setCategoryAt}
          onValueChange={setSeriesValueAt}
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
                <input
                  className="mge-xy-input mge-xy-input-num"
                  type="number"
                  step="any"
                  value={yMin}
                  onChange={e => setYAxis({ min: Number(e.target.value) })}
                />
                <span className="mge-xy-field-label">max</span>
                <input
                  className="mge-xy-input mge-xy-input-num"
                  type="number"
                  step="any"
                  value={yMax}
                  onChange={e => setYAxis({ max: Number(e.target.value) })}
                />
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
                      <span className="mge-xy-col-label">系列{colIdx + 1}</span>
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
                        title={`系列${colIdx + 1} を削除`}
                        onClick={() => deleteSeries(s.index)}
                        aria-label={`Delete series ${colIdx + 1}`}
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
                    title="系列を追加"
                    aria-label="Add series"
                  >
                    +
                  </button>
                </th>
              </tr>
            </thead>

            <tbody>
              {Array.from({ length: rowCount }, (_, rowIdx) => (
                <tr key={rowIdx} className="mge-xy-row">
                  {/* category cell */}
                  <td className="mge-xy-td mge-xy-td-cat">
                    <input
                      data-xy-cell={`${rowIdx}:0`}
                      className="mge-xy-input mge-xy-input-cat"
                      value={categories[rowIdx] ?? ""}
                      onFocus={() => setSelectedCell({ row: rowIdx, col: 0 })}
                      onKeyDown={onXYCellKeyDown(rowIdx, 0)}
                      onChange={e => {
                        setCategoryAt(rowIdx, e.target.value);
                      }}
                      placeholder={`行${rowIdx + 1}`}
                    />
                    <button
                      className="mge-xy-del-row-btn"
                      onClick={() => deleteRow(rowIdx)}
                      title={`行${rowIdx + 1} を削除`}
                      aria-label={`Delete row ${rowIdx + 1}`}
                    >
                      ×
                    </button>
                  </td>
                  {/* value cells */}
                  {seriesList.map((s, colIdx) => (
                    <td key={s.index} className="mge-xy-td mge-xy-td-val">
                      <input
                        data-xy-cell={`${rowIdx}:${colIdx + 1}`}
                        className="mge-xy-input mge-xy-input-num"
                        type="number"
                        step="any"
                        value={s.values[rowIdx] ?? 0}
                        onFocus={() => setSelectedCell({ row: rowIdx, col: colIdx + 1 })}
                        onKeyDown={onXYCellKeyDown(rowIdx, colIdx + 1)}
                        onChange={e => {
                          setSeriesValueAt(s.index, rowIdx, Number(e.target.value));
                        }}
                      />
                    </td>
                  ))}
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
                    title="行を追加"
                    aria-label="Add row"
                  >
                    + 行を追加
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <p className="mge-xy-paste-hint">
            Excelからのコピー（TSV）を表内にペーストするとインポートされる
          </p>
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
