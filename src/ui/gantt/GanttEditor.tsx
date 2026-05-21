import { useCallback, useMemo, useState } from "react";
import { parseGantt } from "../../core/gantt/parser";
import { generateGantt } from "../../core/gantt/generator";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import type { GanttIR, GanttItem, GanttTask, GanttTaskStatus } from "../../core/gantt/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

const STATUSES: GanttTaskStatus[] = ["done", "active", "crit", "milestone"];

const seed = (src: string): GanttIR => {
  const r = parseGantt(src);
  return r.ok ? r.ir : { kind: "gantt", items: [] };
};

export const GanttEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const [ir, setIr] = useState<GanttIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);

  const patchItem = (idx: number, patch: Partial<GanttItem>) =>
    setIr((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? ({ ...it, ...patch } as GanttItem) : it)),
    }));

  const deleteItem = (idx: number) =>
    setIr((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const addSection = () =>
    setIr((prev) => ({
      ...prev,
      items: [...prev.items, { type: "section", title: "New Section" }],
    }));

  const addTask = () =>
    setIr((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { type: "task", label: "New task", modifiers: [], end: "1d" },
      ],
    }));

  const toggleModifier = (idx: number, mod: GanttTaskStatus, checked: boolean) => {
    const item = ir.items[idx];
    if (item.type !== "task") return;
    const next = checked
      ? [...item.modifiers, mod]
      : item.modifiers.filter((m) => m !== mod);
    patchItem(idx, { modifiers: next } as Partial<GanttTask>);
  };

  const currentSource = useMemo(() => generateGantt(ir), [ir]);

  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const r = parseGantt(next);
    if (!r.ok) return { ok: false, error: r.message };
    setIr(r.ir);
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
            <span className="mge-seq-row-label">dateFormat</span>
            <input
              className="mge-seq-input"
              value={ir.dateFormat ?? ""}
              onChange={(e) => setIr({ ...ir, dateFormat: e.target.value || undefined })}
              placeholder="YYYY-MM-DD"
            />
          </div>
        </section>

        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Items</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addSection}>
                + section
              </button>
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addTask}>
                + task
              </button>
            </div>
          </div>

          {ir.items.length === 0 && (
            <p className="mge-seq-empty">セクションまたはタスクを追加。</p>
          )}

          {ir.items.map((item, idx) => {
            if (item.type === "section") {
              return (
                <div key={idx} className="mge-seq-row mge-gantt-section-row">
                  <span className="mge-seq-badge">section</span>
                  <input
                    className="mge-seq-input mge-seq-input-wide"
                    value={item.title}
                    onChange={(e) => patchItem(idx, { title: e.target.value })}
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

            if (item.type === "task") {
              return (
                <div key={idx} className="mge-gantt-task-block">
                  <div className="mge-seq-row">
                    <span className="mge-seq-badge">task</span>
                    <input
                      className="mge-seq-input mge-seq-input-wide"
                      value={item.label}
                      onChange={(e) => patchItem(idx, { label: e.target.value })}
                      placeholder="label"
                    />
                    <button
                      className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
                      onClick={() => deleteItem(idx)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="mge-seq-row mge-gantt-task-detail">
                    <span className="mge-seq-row-label">status</span>
                    {STATUSES.map((mod) => (
                      <label key={mod} className="mge-gantt-mod-label">
                        <input
                          type="checkbox"
                          checked={item.modifiers.includes(mod)}
                          onChange={(e) => toggleModifier(idx, mod, e.target.checked)}
                        />{" "}
                        {mod}
                      </label>
                    ))}
                  </div>
                  <div className="mge-seq-row mge-gantt-task-detail">
                    <span className="mge-seq-row-label">id</span>
                    <input
                      className="mge-seq-input"
                      value={item.id ?? ""}
                      onChange={(e) =>
                        patchItem(idx, { id: e.target.value || undefined } as Partial<GanttTask>)
                      }
                      placeholder="(optional)"
                    />
                    <span className="mge-seq-row-label">start</span>
                    <input
                      className="mge-seq-input"
                      value={item.start ?? ""}
                      onChange={(e) =>
                        patchItem(idx, { start: e.target.value || undefined } as Partial<GanttTask>)
                      }
                      placeholder="YYYY-MM-DD or after id"
                    />
                    <span className="mge-seq-row-label">end</span>
                    <input
                      className="mge-seq-input"
                      value={item.end ?? ""}
                      onChange={(e) =>
                        patchItem(idx, { end: e.target.value || undefined } as Partial<GanttTask>)
                      }
                      placeholder="YYYY-MM-DD or 7d"
                    />
                  </div>
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
