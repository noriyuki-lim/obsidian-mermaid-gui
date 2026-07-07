import { useCallback, useMemo, useState } from "react";
import { parsePie } from "../../core/pie/parser";
import { generatePie } from "../../core/pie/generator";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import { useT } from "../EditorHostContext";
import type { PieIR, PieItem } from "../../core/pie/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

const seed = (initialSource: string): PieIR => {
  const outcome = parsePie(initialSource);
  if (outcome.ok) return outcome.ir;
  return { kind: "pie", showData: false, items: [] };
};

export const PieEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const t = useT();
  const [ir, setIr] = useState<PieIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);

  const updateItem = (index: number, patch: Partial<PieItem>) => {
    setIr((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? ({ ...item, ...patch } as PieItem) : item,
      ),
    }));
  };

  const deleteItem = (index: number) => {
    setIr((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const addSlice = () => {
    const next = ir.items.filter((i) => i.type === "slice").length + 1;
    setIr((prev) => ({
      ...prev,
      items: [...prev.items, { type: "slice", label: `Section ${next}`, value: 1 }],
    }));
  };

  const currentSource = useMemo(() => generatePie(ir), [ir]);

  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const outcome = parsePie(next);
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
      diagramKind="pie"
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
            <label className="mge-seq-row-label">
              <input
                type="checkbox"
                checked={ir.showData}
                onChange={(e) => setIr({ ...ir, showData: e.target.checked })}
              />{" "}
              showData
            </label>
          </div>
        </section>

        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Slices</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addSlice}>
                + slice
              </button>
            </div>
          </div>
          {ir.items.filter((i) => i.type === "slice").length === 0 && (
            <p className="mge-seq-empty">{t.pie.slicesEmpty}</p>
          )}
          {ir.items.map((item, idx) => {
            if (item.type === "slice") {
              return (
                <div key={idx} className="mge-seq-row">
                  <span className="mge-seq-badge">slice</span>
                  <input
                    className="mge-seq-input mge-seq-input-wide"
                    value={item.label}
                    onChange={(e) => updateItem(idx, { label: e.target.value })}
                    placeholder="label"
                  />
                  <span className="mge-seq-row-label">:</span>
                  <input
                    className="mge-seq-input"
                    type="number"
                    step="any"
                    min={0}
                    value={item.value}
                    onChange={(e) =>
                      updateItem(idx, { value: Number(e.target.value) })
                    }
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
