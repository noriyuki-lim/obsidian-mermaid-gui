import { useCallback, useState } from "react";
import { parseQuadrant } from "../../core/quadrant/parser";
import { generateQuadrant } from "../../core/quadrant/generator";
import type {
  QuadrantIR,
  QuadrantItem,
} from "../../core/quadrant/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
}

const seed = (initialSource: string): QuadrantIR => {
  const outcome = parseQuadrant(initialSource);
  if (outcome.ok) return outcome.ir;
  return { kind: "quadrantChart", quadrants: {}, items: [] };
};

const quadrantKeys = ["q1", "q2", "q3", "q4"] as const;
const quadrantLabels: Record<(typeof quadrantKeys)[number], string> = {
  q1: "Quadrant 1 (top right)",
  q2: "Quadrant 2 (top left)",
  q3: "Quadrant 3 (bottom left)",
  q4: "Quadrant 4 (bottom right)",
};

export const QuadrantEditor = ({ initialSource, onSave, onCancel }: Props) => {
  const [ir, setIr] = useState<QuadrantIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);

  const updateItem = (index: number, patch: Partial<QuadrantItem>) => {
    setIr((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? ({ ...item, ...patch } as QuadrantItem) : item,
      ),
    }));
  };

  const deleteItem = (index: number) => {
    setIr((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const addPoint = () => {
    const next = ir.items.filter((i) => i.type === "point").length + 1;
    setIr((prev) => ({
      ...prev,
      items: [...prev.items, { type: "point", name: `Point ${next}`, x: 0.5, y: 0.5 }],
    }));
  };

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(generateQuadrant(ir));
    } finally {
      setSaving(false);
    }
  }, [saving, ir, onSave]);

  return (
    <div className="mge-seq-editor">
      <div className="mge-seq-toolbar">
        <button className="mge-seq-btn mge-seq-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </button>
        <button className="mge-seq-btn" onClick={onCancel} disabled={saving}>
          キャンセル
        </button>
      </div>

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
          </div>
          <div className="mge-seq-row">
            <span className="mge-seq-badge">x-axis</span>
            <input
              className="mge-seq-input mge-seq-input-wide"
              value={ir.xAxis?.left ?? ""}
              onChange={(e) =>
                setIr({
                  ...ir,
                  xAxis: e.target.value
                    ? { left: e.target.value, right: ir.xAxis?.right }
                    : undefined,
                })
              }
              placeholder="left label"
            />
            <span className="mge-seq-row-label">→</span>
            <input
              className="mge-seq-input mge-seq-input-wide"
              value={ir.xAxis?.right ?? ""}
              onChange={(e) =>
                setIr({
                  ...ir,
                  xAxis: ir.xAxis
                    ? { ...ir.xAxis, right: e.target.value || undefined }
                    : e.target.value
                      ? { left: "", right: e.target.value }
                      : undefined,
                })
              }
              placeholder="right label (optional)"
            />
          </div>
          <div className="mge-seq-row">
            <span className="mge-seq-badge">y-axis</span>
            <input
              className="mge-seq-input mge-seq-input-wide"
              value={ir.yAxis?.bottom ?? ""}
              onChange={(e) =>
                setIr({
                  ...ir,
                  yAxis: e.target.value
                    ? { bottom: e.target.value, top: ir.yAxis?.top }
                    : undefined,
                })
              }
              placeholder="bottom label"
            />
            <span className="mge-seq-row-label">→</span>
            <input
              className="mge-seq-input mge-seq-input-wide"
              value={ir.yAxis?.top ?? ""}
              onChange={(e) =>
                setIr({
                  ...ir,
                  yAxis: ir.yAxis
                    ? { ...ir.yAxis, top: e.target.value || undefined }
                    : e.target.value
                      ? { bottom: "", top: e.target.value }
                      : undefined,
                })
              }
              placeholder="top label (optional)"
            />
          </div>
        </section>

        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Quadrant labels</span>
          </div>
          {quadrantKeys.map((key) => (
            <div key={key} className="mge-seq-row">
              <span className="mge-seq-row-label">{quadrantLabels[key]}</span>
              <input
                className="mge-seq-input mge-seq-input-wide"
                value={ir.quadrants[key] ?? ""}
                onChange={(e) =>
                  setIr({
                    ...ir,
                    quadrants: { ...ir.quadrants, [key]: e.target.value || undefined },
                  })
                }
                placeholder="(no label)"
              />
            </div>
          ))}
        </section>

        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Points</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addPoint}>
                + point
              </button>
            </div>
          </div>
          {ir.items.filter((i) => i.type === "point").length === 0 && (
            <p className="mge-seq-empty">ポイントが未定義。+ で追加。</p>
          )}
          {ir.items.map((item, idx) => {
            if (item.type === "point") {
              return (
                <div key={idx} className="mge-seq-row">
                  <input
                    className="mge-seq-input mge-seq-input-wide"
                    value={item.name}
                    onChange={(e) => updateItem(idx, { name: e.target.value })}
                    placeholder="name"
                  />
                  <span className="mge-seq-row-label">x</span>
                  <input
                    className="mge-seq-input"
                    type="number"
                    step={0.05}
                    min={0}
                    max={1}
                    value={item.x}
                    onChange={(e) => updateItem(idx, { x: Number(e.target.value) })}
                  />
                  <span className="mge-seq-row-label">y</span>
                  <input
                    className="mge-seq-input"
                    type="number"
                    step={0.05}
                    min={0}
                    max={1}
                    value={item.y}
                    onChange={(e) => updateItem(idx, { y: Number(e.target.value) })}
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
    </div>
  );
};
