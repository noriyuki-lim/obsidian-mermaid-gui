import { useCallback, useMemo, useState } from "react";
import { parseTimeline } from "../../core/timeline/parser";
import { generateTimeline } from "../../core/timeline/generator";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import type { TimelineIR, TimelineItem, TimelinePeriod } from "../../core/timeline/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

const seed = (src: string): TimelineIR => {
  const r = parseTimeline(src);
  return r.ok ? r.ir : { kind: "timeline", items: [] };
};

export const TimelineEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const [ir, setIr] = useState<TimelineIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);

  const patchItem = (idx: number, patch: Partial<TimelineItem>) =>
    setIr((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === idx ? ({ ...it, ...patch } as TimelineItem) : it)),
    }));

  const deleteItem = (idx: number) =>
    setIr((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== idx) }));

  const addSection = () =>
    setIr((prev) => ({
      ...prev,
      items: [...prev.items, { type: "section", title: "New Section" }],
    }));

  const addPeriod = () =>
    setIr((prev) => ({
      ...prev,
      items: [...prev.items, { type: "period", label: "YYYY", events: ["Event"] }],
    }));

  const updateEvent = (itemIdx: number, evtIdx: number, value: string) => {
    const item = ir.items[itemIdx];
    if (item.type !== "period") return;
    const events = item.events.map((e, i) => (i === evtIdx ? value : e));
    patchItem(itemIdx, { events } as Partial<TimelinePeriod>);
  };

  const addEvent = (itemIdx: number) => {
    const item = ir.items[itemIdx];
    if (item.type !== "period") return;
    patchItem(itemIdx, { events: [...item.events, "Event"] } as Partial<TimelinePeriod>);
  };

  const removeEvent = (itemIdx: number, evtIdx: number) => {
    const item = ir.items[itemIdx];
    if (item.type !== "period") return;
    patchItem(itemIdx, {
      events: item.events.filter((_, i) => i !== evtIdx),
    } as Partial<TimelinePeriod>);
  };

  const currentSource = useMemo(() => generateTimeline(ir), [ir]);

  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const r = parseTimeline(next);
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
      diagramKind="timeline"
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
        </section>

        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Events</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addSection}>
                + section
              </button>
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addPeriod}>
                + period
              </button>
            </div>
          </div>

          {ir.items.length === 0 && (
            <p className="mge-seq-empty">セクションまたは期間を追加。</p>
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

            if (item.type === "period") {
              return (
                <div key={idx} className="mge-gantt-task-block">
                  <div className="mge-seq-row">
                    <span className="mge-seq-badge mge-timeline-period-badge">period</span>
                    <input
                      className="mge-seq-input"
                      value={item.label}
                      onChange={(e) => patchItem(idx, { label: e.target.value })}
                      placeholder="2024"
                    />
                    <button
                      className="mge-seq-btn mge-seq-btn-sm"
                      onClick={() => addEvent(idx)}
                    >
                      + event
                    </button>
                    <button
                      className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
                      onClick={() => deleteItem(idx)}
                    >
                      ×
                    </button>
                  </div>
                  {item.events.map((evt, ei) => (
                    <div key={ei} className="mge-seq-row mge-gantt-task-detail">
                      <span className="mge-seq-row-label">event</span>
                      <input
                        className="mge-seq-input mge-seq-input-wide"
                        value={evt}
                        onChange={(e) => updateEvent(idx, ei, e.target.value)}
                        placeholder="Event description"
                      />
                      <button
                        className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
                        onClick={() => removeEvent(idx, ei)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
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
