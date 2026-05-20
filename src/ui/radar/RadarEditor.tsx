import { useCallback, useMemo, useState } from "react";
import { parseRadar } from "../../core/radar/parser";
import { generateRadar } from "../../core/radar/generator";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import type { RadarAxis, RadarCurve, RadarIR } from "../../core/radar/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

const seed = (initialSource: string): RadarIR => {
  const outcome = parseRadar(initialSource);
  if (outcome.ok) return outcome.ir;
  return { kind: "radar-beta", axes: [], curves: [], options: {}, rawLines: [] };
};

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

export const RadarEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const [ir, setIr] = useState<RadarIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);

  const updateAxis = (idx: number, patch: Partial<RadarAxis>) => {
    setIr((prev) => ({
      ...prev,
      axes: prev.axes.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    }));
  };
  const deleteAxis = (idx: number) => {
    setIr((prev) => ({ ...prev, axes: prev.axes.filter((_, i) => i !== idx) }));
  };
  const addAxis = () => {
    const next = ir.axes.length + 1;
    setIr((prev) => ({ ...prev, axes: [...prev.axes, { id: `axis${next}` }] }));
  };

  const updateCurve = (idx: number, patch: Partial<RadarCurve>) => {
    setIr((prev) => ({
      ...prev,
      curves: prev.curves.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  };
  const deleteCurve = (idx: number) => {
    setIr((prev) => ({ ...prev, curves: prev.curves.filter((_, i) => i !== idx) }));
  };
  const addCurve = () => {
    const next = ir.curves.length + 1;
    setIr((prev) => ({
      ...prev,
      curves: [...prev.curves, { id: `curve${next}`, values: [] }],
    }));
  };

  const currentSource = useMemo(() => generateRadar(ir), [ir]);

  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const outcome = parseRadar(next);
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

  // Obsidian's bundled mermaid does not parse radar-beta. We still wire
  // renderMermaid in case a future version does; today the shell shows the
  // error returned by the renderer (or the "preview unavailable" hint).
  return (
    <EditorShell
      currentSource={currentSource}
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      renderMermaid={renderMermaid}
      previewUnavailableMessage="Obsidian の内蔵 Mermaid は radar-beta 非対応。コードのみ確認可能。"
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
        </section>

        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Axes</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addAxis}>
                + axis
              </button>
            </div>
          </div>
          {ir.axes.length === 0 && <p className="mge-seq-empty">軸が未定義。+ で追加。</p>}
          {ir.axes.map((axis, idx) => (
            <div key={idx} className="mge-seq-row">
              <span className="mge-seq-row-label">id</span>
              <input
                className="mge-seq-input"
                value={axis.id}
                onChange={(e) => updateAxis(idx, { id: e.target.value })}
                placeholder="id"
              />
              <span className="mge-seq-row-label">label</span>
              <input
                className="mge-seq-input mge-seq-input-wide"
                value={axis.label ?? ""}
                onChange={(e) => updateAxis(idx, { label: e.target.value || undefined })}
                placeholder="(optional)"
              />
              <button
                className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
                onClick={() => deleteAxis(idx)}
              >
                ×
              </button>
            </div>
          ))}
        </section>

        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Curves</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addCurve}>
                + curve
              </button>
            </div>
          </div>
          {ir.curves.length === 0 && <p className="mge-seq-empty">カーブが未定義。+ で追加。</p>}
          {ir.curves.map((curve, idx) => (
            <div key={idx} className="mge-seq-row">
              <span className="mge-seq-row-label">id</span>
              <input
                className="mge-seq-input"
                value={curve.id}
                onChange={(e) => updateCurve(idx, { id: e.target.value })}
                placeholder="id"
              />
              <span className="mge-seq-row-label">label</span>
              <input
                className="mge-seq-input"
                value={curve.label ?? ""}
                onChange={(e) => updateCurve(idx, { label: e.target.value || undefined })}
                placeholder="(optional)"
              />
              <span className="mge-seq-row-label">values</span>
              <input
                className="mge-seq-input mge-seq-input-wide"
                value={curve.values.join(", ")}
                onChange={(e) => updateCurve(idx, { values: parseValues(e.target.value) })}
                placeholder="comma-separated"
              />
              <button
                className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
                onClick={() => deleteCurve(idx)}
              >
                ×
              </button>
            </div>
          ))}
        </section>

        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Options</span>
          </div>
          <div className="mge-seq-row">
            <label className="mge-seq-row-label">
              <input
                type="checkbox"
                checked={ir.options.showLegend ?? false}
                onChange={(e) =>
                  setIr({
                    ...ir,
                    options: { ...ir.options, showLegend: e.target.checked || undefined },
                  })
                }
              />{" "}
              showLegend
            </label>
          </div>
          <div className="mge-seq-row">
            <span className="mge-seq-row-label">max</span>
            <input
              className="mge-seq-input"
              type="number"
              step="any"
              value={ir.options.max ?? ""}
              onChange={(e) =>
                setIr({
                  ...ir,
                  options: {
                    ...ir.options,
                    max: e.target.value === "" ? undefined : Number(e.target.value),
                  },
                })
              }
            />
            <span className="mge-seq-row-label">min</span>
            <input
              className="mge-seq-input"
              type="number"
              step="any"
              value={ir.options.min ?? ""}
              onChange={(e) =>
                setIr({
                  ...ir,
                  options: {
                    ...ir.options,
                    min: e.target.value === "" ? undefined : Number(e.target.value),
                  },
                })
              }
            />
            <span className="mge-seq-row-label">ticks</span>
            <input
              className="mge-seq-input"
              type="number"
              step={1}
              value={ir.options.ticks ?? ""}
              onChange={(e) =>
                setIr({
                  ...ir,
                  options: {
                    ...ir.options,
                    ticks: e.target.value === "" ? undefined : Number(e.target.value),
                  },
                })
              }
            />
            <span className="mge-seq-row-label">graticule</span>
            <select
              className="mge-seq-select"
              value={ir.options.graticule ?? ""}
              onChange={(e) =>
                setIr({
                  ...ir,
                  options: {
                    ...ir.options,
                    graticule:
                      e.target.value === ""
                        ? undefined
                        : (e.target.value as "circle" | "polygon"),
                  },
                })
              }
            >
              <option value="">(default)</option>
              <option value="circle">circle</option>
              <option value="polygon">polygon</option>
            </select>
          </div>
        </section>

        {ir.rawLines.length > 0 && (
          <section className="mge-seq-section">
            <div className="mge-seq-section-header">
              <span className="mge-seq-section-title">Raw lines (read-only)</span>
            </div>
            {ir.rawLines.map((raw, idx) => (
              <div key={idx} className="mge-seq-row mge-seq-row-raw">
                <span className="mge-seq-badge mge-seq-badge-raw">raw</span>
                <code className="mge-seq-raw-line">{raw.line.trim()}</code>
              </div>
            ))}
          </section>
        )}
      </div>
    </EditorShell>
  );
};
