import { useCallback, useMemo, useState } from "react";
import { parseJourney } from "../../core/journey/parser";
import { generateJourney } from "../../core/journey/generator";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import type { JourneyIR, JourneyItem, JourneyTask } from "../../core/journey/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

const SCORE_LABEL: Record<number, string> = {
  1: "😞 1",
  2: "😟 2",
  3: "😐 3",
  4: "🙂 4",
  5: "😊 5",
  6: "😄 6",
  7: "🤩 7",
};

function seed(source: string): JourneyIR {
  const out = parseJourney(source);
  if (out.ok) return out.ir;
  return { kind: "journey", items: [] };
}

export const JourneyEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const [ir, setIr] = useState<JourneyIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);

  const currentSource = useMemo(() => generateJourney(ir), [ir]);

  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const out = parseJourney(next);
    if (!out.ok) return { ok: false, error: out.message };
    setIr(out.ir);
    return { ok: true };
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try { await onSave(currentSource); } finally { setSaving(false); }
  }, [saving, currentSource, onSave]);

  const updateItem = (idx: number, patch: Partial<JourneyItem>) => {
    setIr((p) => ({
      ...p,
      items: p.items.map((it, i) => (i === idx ? ({ ...it, ...patch } as JourneyItem) : it)),
    }));
  };

  const deleteItem = (idx: number) => {
    setIr((p) => ({ ...p, items: p.items.filter((_, i) => i !== idx) }));
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= ir.items.length) return;
    setIr((p) => {
      const items = [...p.items];
      [items[idx], items[target]] = [items[target], items[idx]];
      return { ...p, items };
    });
  };

  const addSection = () => {
    setIr((p) => ({
      ...p,
      items: [...p.items, { type: "section", title: `Section ${p.items.filter((i) => i.type === "section").length + 1}` }],
    }));
  };

  const addTask = () => {
    setIr((p) => ({
      ...p,
      items: [...p.items, { type: "task", name: "New task", score: 5, actors: ["Me"] }],
    }));
  };

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
            <span className="mge-seq-section-title">Journey settings</span>
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
            <span className="mge-seq-section-title">Sections & Tasks</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addSection}>+ section</button>
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addTask}>+ task</button>
            </div>
          </div>
          {ir.items.length === 0 && (
            <p className="mge-seq-empty">未定義。+ で追加。</p>
          )}
          {ir.items.map((item, idx) => {
            if (item.type === "section") {
              return (
                <div key={idx} className="mge-seq-row mge-seq-row-section">
                  <span className="mge-seq-badge">section</span>
                  <input
                    className="mge-seq-input mge-seq-input-wide"
                    value={item.title}
                    onChange={(e) => updateItem(idx, { type: "section", title: e.target.value })}
                    placeholder="section title"
                  />
                  <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => moveItem(idx, -1)}>↑</button>
                  <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => moveItem(idx, 1)}>↓</button>
                  <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => deleteItem(idx)}>×</button>
                </div>
              );
            }
            if (item.type === "task") {
              const task = item as JourneyTask;
              return (
                <div key={idx} className="mge-seq-row mge-journey-task-row" style={{ marginLeft: 16 }}>
                  <span className="mge-seq-badge">task</span>
                  <input
                    className="mge-seq-input"
                    value={task.name}
                    onChange={(e) => updateItem(idx, { type: "task", name: e.target.value, score: task.score, actors: task.actors })}
                    placeholder="task name"
                    style={{ width: "140px" }}
                  />
                  <select
                    className="mge-seq-select"
                    value={task.score}
                    onChange={(e) => updateItem(idx, { type: "task", name: task.name, score: parseInt(e.target.value, 10), actors: task.actors })}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <option key={n} value={n}>{SCORE_LABEL[n]}</option>
                    ))}
                  </select>
                  <input
                    className="mge-seq-input mge-seq-input-wide"
                    value={task.actors.join(", ")}
                    onChange={(e) => updateItem(idx, {
                      type: "task",
                      name: task.name,
                      score: task.score,
                      actors: e.target.value.split(",").map((a) => a.trim()).filter((a) => a.length > 0),
                    })}
                    placeholder="actor1, actor2"
                  />
                  <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => moveItem(idx, -1)}>↑</button>
                  <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => moveItem(idx, 1)}>↓</button>
                  <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => deleteItem(idx)}>×</button>
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
