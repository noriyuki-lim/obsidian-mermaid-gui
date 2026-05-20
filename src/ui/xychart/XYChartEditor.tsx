import { useCallback, useMemo, useState } from "react";
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

const seed = (initialSource: string): XYChartIR => {
  const outcome = parseXYChart(initialSource);
  if (outcome.ok) return outcome.ir;
  return { kind: "xychart-beta", orientation: "vertical", items: [] };
};

const formatValues = (values: number[]): string => values.join(", ");

const parseValues = (text: string): number[] => {
  const out: number[] = [];
  for (const token of text.split(",")) {
    const trimmed = token.trim();
    if (trimmed.length === 0) continue;
    const n = Number(trimmed);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
};

export const XYChartEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const [ir, setIr] = useState<XYChartIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);

  const updateItem = (index: number, patch: Partial<XYItem>) => {
    setIr((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? ({ ...item, ...patch } as XYItem) : item,
      ),
    }));
  };

  const deleteItem = (index: number) => {
    setIr((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const addSeries = (kind: XYSeriesKind) => {
    setIr((prev) => ({
      ...prev,
      items: [...prev.items, { type: "series", series: kind, values: [] }],
    }));
  };

  const updateAxis = (which: "xAxis" | "yAxis", axis: XYAxis | undefined) => {
    setIr((prev) => ({ ...prev, [which]: axis }));
  };

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

  return (
    <EditorShell
      currentSource={currentSource}
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      renderMermaid={renderMermaid}
      onSourceEdit={handleSourceEdit}
    >
      <div className="mge-seq-body">
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Chart settings</span>
          </div>
          <div className="mge-seq-row">
            <span className="mge-seq-row-label">title</span>
            <input
              className="mge-seq-input mge-seq-input-wide"
              value={ir.title ?? ""}
              onChange={(e) => setIr({ ...ir, title: e.target.value || undefined })}
              placeholder="(no title)"
            />
          </div>
          <div className="mge-seq-row">
            <span className="mge-seq-row-label">orientation</span>
            <select
              className="mge-seq-select"
              value={ir.orientation}
              onChange={(e) =>
                setIr({ ...ir, orientation: e.target.value as XYOrientation })
              }
            >
              <option value="vertical">vertical</option>
              <option value="horizontal">horizontal</option>
            </select>
          </div>
        </section>

        <AxisSection
          label="x-axis"
          axis={ir.xAxis}
          onChange={(a) => updateAxis("xAxis", a)}
        />
        <AxisSection
          label="y-axis"
          axis={ir.yAxis}
          onChange={(a) => updateAxis("yAxis", a)}
        />

        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Series</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => addSeries("bar")}>
                + bar
              </button>
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => addSeries("line")}>
                + line
              </button>
            </div>
          </div>
          {ir.items.filter((i) => i.type === "series").length === 0 && (
            <p className="mge-seq-empty">系列が未定義。+ で追加。</p>
          )}
          {ir.items.map((item, idx) => {
            if (item.type === "series") {
              return (
                <div key={idx} className="mge-seq-row">
                  <span className="mge-seq-badge">{item.series}</span>
                  <input
                    className="mge-seq-input mge-seq-input-wide"
                    value={formatValues(item.values)}
                    onChange={(e) =>
                      updateItem(idx, { values: parseValues(e.target.value) })
                    }
                    placeholder="comma-separated numbers"
                  />
                  <button
                    className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
                    onClick={() => deleteItem(idx)}
                  >
                    ×
                  </button>
                </div>
              );
            }
            return (
              <div key={idx} className="mge-seq-row mge-seq-row-raw">
                <span className="mge-seq-badge mge-seq-badge-raw">raw</span>
                <code className="mge-seq-raw-line">{item.line.trim()}</code>
              </div>
            );
          })}
        </section>
      </div>
    </EditorShell>
  );
};

const AxisSection = ({
  label,
  axis,
  onChange,
}: {
  label: string;
  axis: XYAxis | undefined;
  onChange: (axis: XYAxis | undefined) => void;
}) => {
  const kind = axis?.kind ?? "none";

  const onKindChange = (next: "none" | XYAxis["kind"]) => {
    if (next === "none") {
      onChange(undefined);
      return;
    }
    if (next === "label-only") {
      onChange({ kind: "label-only", title: axis && "title" in axis && axis.title ? axis.title : "" });
      return;
    }
    if (next === "numeric") {
      onChange({
        kind: "numeric",
        title: axis && "title" in axis ? axis.title : undefined,
        min: 0,
        max: 100,
      });
      return;
    }
    onChange({
      kind: "categorical",
      title: axis && "title" in axis ? axis.title : undefined,
      categories: [],
    });
  };

  return (
    <section className="mge-seq-section">
      <div className="mge-seq-section-header">
        <span className="mge-seq-section-title">{label}</span>
        <select
          className="mge-seq-select"
          value={kind}
          onChange={(e) => onKindChange(e.target.value as "none" | XYAxis["kind"])}
        >
          <option value="none">(none)</option>
          <option value="label-only">label only</option>
          <option value="numeric">numeric range</option>
          <option value="categorical">categorical</option>
        </select>
      </div>
      {axis && (axis.kind === "numeric" || axis.kind === "categorical") && (
        <div className="mge-seq-row">
          <span className="mge-seq-row-label">title</span>
          <input
            className="mge-seq-input mge-seq-input-wide"
            value={axis.title ?? ""}
            onChange={(e) =>
              onChange({
                ...axis,
                title: e.target.value || undefined,
              } as XYAxis)
            }
            placeholder="(no title)"
          />
        </div>
      )}
      {axis?.kind === "label-only" && (
        <div className="mge-seq-row">
          <span className="mge-seq-row-label">title</span>
          <input
            className="mge-seq-input mge-seq-input-wide"
            value={axis.title}
            onChange={(e) => onChange({ kind: "label-only", title: e.target.value })}
            placeholder="title"
          />
        </div>
      )}
      {axis?.kind === "numeric" && (
        <div className="mge-seq-row">
          <span className="mge-seq-row-label">min</span>
          <input
            className="mge-seq-input"
            type="number"
            step="any"
            value={axis.min}
            onChange={(e) => onChange({ ...axis, min: Number(e.target.value) })}
          />
          <span className="mge-seq-row-label">max</span>
          <input
            className="mge-seq-input"
            type="number"
            step="any"
            value={axis.max}
            onChange={(e) => onChange({ ...axis, max: Number(e.target.value) })}
          />
        </div>
      )}
      {axis?.kind === "categorical" && (
        <div className="mge-seq-row">
          <span className="mge-seq-row-label">categories</span>
          <input
            className="mge-seq-input mge-seq-input-wide"
            value={axis.categories.join(", ")}
            onChange={(e) =>
              onChange({
                ...axis,
                categories: e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
            placeholder="comma-separated"
          />
        </div>
      )}
    </section>
  );
};
