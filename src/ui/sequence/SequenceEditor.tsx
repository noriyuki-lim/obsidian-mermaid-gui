import { useMemo, useState, useCallback } from "react";
import { parseSequence } from "../../core/sequence/parser";
import { generateSequence } from "../../core/sequence/generator";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import { useT } from "../EditorHostContext";
import type {
  ActorItem,
  ActivationItem,
  ArrowType,
  MessageItem,
  NoteItem,
  NotePosition,
  ParticipantItem,
  SequenceItem,
} from "../../core/sequence/ir-types";

interface Props {
  /** Mermaid block body (without fences, GUI metadata already stripped). */
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

export const SequenceEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const t = useT();
  const [items, setItems] = useState<SequenceItem[]>(() => {
    const outcome = parseSequence(initialSource);
    return outcome.ok ? outcome.ir.items : [];
  });
  const [saving, setSaving] = useState(false);

  // Helpers
  const participantItems = items.filter(
    (i): i is ParticipantItem | ActorItem => i.type === "participant" || i.type === "actor",
  );
  const aliases = participantItems.map((p) => p.alias);

  const updateAt = (index: number, patch: Record<string, unknown>) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? ({ ...item, ...patch } as SequenceItem) : item)),
    );
  };

  const deleteAt = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addParticipant = (type: "participant" | "actor") => {
    const alias = `P${participantItems.length + 1}`;
    const newItem: ParticipantItem | ActorItem = { type, alias };
    const lastParticipantIdx = items.reduce(
      (last, item, i) =>
        item.type === "participant" || item.type === "actor" ? i : last,
      -1,
    );
    setItems((prev) => {
      const next = [...prev];
      next.splice(lastParticipantIdx + 1, 0, newItem);
      return next;
    });
  };

  const addMessage = () => {
    const from = aliases[0] ?? "A";
    const to = aliases[1] ?? "B";
    const item: MessageItem = { type: "message", from, to, arrow: "solid-arrow", text: "" };
    setItems((prev) => [...prev, item]);
  };

  const addNote = () => {
    const item: NoteItem = {
      type: "note",
      position: "over",
      targets: [aliases[0] ?? "A"],
      text: "",
    };
    setItems((prev) => [...prev, item]);
  };

  const addActivation = (active: boolean) => {
    const item: ActivationItem = {
      type: "activation",
      participant: aliases[0] ?? "A",
      active,
    };
    setItems((prev) => [...prev, item]);
  };

  const currentSource = useMemo(
    () => generateSequence({ kind: "sequenceDiagram", items }),
    [items],
  );

  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const outcome = parseSequence(next);
    if (!outcome.ok) return { ok: false, error: outcome.message };
    setItems(outcome.ir.items);
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

  const participantSelect = (value: string, onChange: (v: string) => void) => (
    <select className="mge-seq-select" value={value} onChange={(e) => onChange(e.target.value)}>
      {aliases.map((a) => (
        <option key={a} value={a}>
          {a}
        </option>
      ))}
      {!aliases.includes(value) && <option value={value}>{value}</option>}
    </select>
  );

  return (
    <EditorShell
      diagramKind="sequenceDiagram"
      currentSource={currentSource}
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      renderMermaid={renderMermaid}
      onSourceEdit={handleSourceEdit}
    >
      <div className="mge-seq-body">
        {/* Participants */}
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Participants</span>
            <div className="mge-seq-add-btns">
              <button
                className="mge-seq-btn mge-seq-btn-sm"
                onClick={() => addParticipant("participant")}
              >
                + participant
              </button>
              <button
                className="mge-seq-btn mge-seq-btn-sm"
                onClick={() => addParticipant("actor")}
              >
                + actor
              </button>
            </div>
          </div>
          {participantItems.length === 0 && (
            <p className="mge-seq-empty">{t.sequence.participantsEmpty}</p>
          )}
          {items.map((item, idx) => {
            if (item.type !== "participant" && item.type !== "actor") return null;
            return (
              <div key={idx} className="mge-seq-row">
                <span className="mge-seq-badge">{item.type}</span>
                <input
                  className="mge-seq-input"
                  value={item.alias}
                  onChange={(e) => updateAt(idx, { alias: e.target.value })}
                  placeholder="alias"
                />
                <span className="mge-seq-row-label">as</span>
                <input
                  className="mge-seq-input mge-seq-input-wide"
                  value={item.label ?? ""}
                  onChange={(e) => updateAt(idx, { label: e.target.value || undefined })}
                  placeholder="label (optional)"
                />
                <button
                  className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
                  onClick={() => deleteAt(idx)}
                >
                  ×
                </button>
              </div>
            );
          })}
        </section>

        {/* Messages & Events */}
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Messages & Events</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addMessage}>
                + message
              </button>
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addNote}>
                + note
              </button>
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => addActivation(true)}>
                + activate
              </button>
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => addActivation(false)}>
                + deactivate
              </button>
            </div>
          </div>
          {items.filter((i) => i.type !== "participant" && i.type !== "actor").length === 0 && (
            <p className="mge-seq-empty">{t.sequence.messagesEmpty}</p>
          )}
          {items.map((item, idx) => {
            if (item.type === "participant" || item.type === "actor") return null;

            if (item.type === "message") {
              return (
                <div key={idx} className="mge-seq-row">
                  {participantSelect(item.from, (v) => updateAt(idx, { from: v }))}
                  <select
                    className="mge-seq-select mge-seq-arrow-select"
                    value={item.arrow}
                    onChange={(e) => updateAt(idx, { arrow: e.target.value as ArrowType })}
                  >
                    <option value="solid-arrow">-&gt;&gt;</option>
                    <option value="dotted-arrow">--&gt;&gt;</option>
                  </select>
                  {participantSelect(item.to, (v) => updateAt(idx, { to: v }))}
                  <span className="mge-seq-row-label">:</span>
                  <input
                    className="mge-seq-input mge-seq-input-wide"
                    value={item.text}
                    onChange={(e) => updateAt(idx, { text: e.target.value })}
                    placeholder="message text"
                  />
                  <button
                    className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
                    onClick={() => deleteAt(idx)}
                  >
                    ×
                  </button>
                </div>
              );
            }

            if (item.type === "note") {
              return (
                <div key={idx} className="mge-seq-row">
                  <span className="mge-seq-badge">Note</span>
                  <select
                    className="mge-seq-select"
                    value={item.position}
                    onChange={(e) => updateAt(idx, { position: e.target.value as NotePosition })}
                  >
                    <option value="over">over</option>
                    <option value="right of">right of</option>
                    <option value="left of">left of</option>
                  </select>
                  <input
                    className="mge-seq-input"
                    value={item.targets.join(",")}
                    onChange={(e) =>
                      updateAt(idx, {
                        targets: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder={t.sequence.actorsPlaceholder}
                  />
                  <span className="mge-seq-row-label">:</span>
                  <input
                    className="mge-seq-input mge-seq-input-wide"
                    value={item.text}
                    onChange={(e) => updateAt(idx, { text: e.target.value })}
                    placeholder="note text"
                  />
                  <button
                    className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
                    onClick={() => deleteAt(idx)}
                  >
                    ×
                  </button>
                </div>
              );
            }

            if (item.type === "activation") {
              return (
                <div key={idx} className="mge-seq-row">
                  <button
                    className="mge-seq-btn mge-seq-btn-sm"
                    onClick={() => updateAt(idx, { active: !item.active })}
                  >
                    {item.active ? "activate" : "deactivate"}
                  </button>
                  {participantSelect(item.participant, (v) => updateAt(idx, { participant: v }))}
                  <button
                    className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
                    onClick={() => deleteAt(idx)}
                  >
                    ×
                  </button>
                </div>
              );
            }

            // raw
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
