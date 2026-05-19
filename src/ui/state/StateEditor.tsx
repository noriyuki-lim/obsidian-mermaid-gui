import { useState, useCallback } from "react";
import { parseStateDiagram } from "../../core/state/parser";
import { generateStateDiagram } from "../../core/state/generator";
import type {
  NotePosition,
  RawItem,
  StateDecl,
  StateDescItem,
  StateNote,
  StateDiagramItem,
  TransitionItem,
} from "../../core/state/ir-types";

interface Props {
  /** Mermaid block body (without fences, GUI metadata already stripped). */
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
}

let _idCounter = 0;
const uid = () => String(++_idCounter);

const NOTE_POSITIONS: NotePosition[] = ["right of", "left of"];

// ---------------------------------------------------------------------------
// Initialise structured state from parsed IR
// ---------------------------------------------------------------------------
const initState = (items: StateDiagramItem[]) => {
  const transitions: Array<TransitionItem & { id: string }> = [];
  const stateDecls: Array<StateDecl & { id: string }> = [];
  const stateDescs: Array<StateDescItem & { id: string }> = [];
  const notes: Array<StateNote & { id: string }> = [];
  const rawItems: RawItem[] = [];

  for (const item of items) {
    if (item.type === "transition") transitions.push({ ...item, id: uid() });
    else if (item.type === "state") stateDecls.push({ ...item, id: uid() });
    else if (item.type === "state-desc") stateDescs.push({ ...item, id: uid() });
    else if (item.type === "note") notes.push({ ...item, id: uid() });
    else if (item.type === "raw") rawItems.push(item);
  }

  return { transitions, stateDecls, stateDescs, notes, rawItems };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const StateEditor = ({ initialSource, onSave, onCancel }: Props) => {
  const parsed = parseStateDiagram(initialSource);
  const init = parsed.ok
    ? initState(parsed.ir.items)
    : { transitions: [], stateDecls: [], stateDescs: [], notes: [], rawItems: [] };

  type TransitionRow = TransitionItem & { id: string };
  type StateDeclRow = StateDecl & { id: string };
  type StateDescRow = StateDescItem & { id: string };
  type NoteRow = StateNote & { id: string };

  const [transitions, setTransitions] = useState<TransitionRow[]>(init.transitions);
  const [stateDecls, setStateDecls] = useState<StateDeclRow[]>(init.stateDecls);
  const [stateDescs, setStateDescs] = useState<StateDescRow[]>(init.stateDescs);
  const [notes, setNotes] = useState<NoteRow[]>(init.notes);
  const rawItems = init.rawItems;
  const [saving, setSaving] = useState(false);

  // Collect known state names for autocomplete
  const knownStates = Array.from(
    new Set([
      ...transitions.flatMap((t) => [t.from, t.to]),
      ...stateDecls.map((s) => s.name),
      ...stateDescs.map((s) => s.name),
    ]).values(),
  ).filter((s) => s !== "[*]");

  const buildSource = useCallback(() => {
    const items: StateDiagramItem[] = [
      ...stateDecls,
      ...stateDescs,
      ...transitions,
      ...notes,
      ...rawItems,
    ];
    return generateStateDiagram({ kind: "stateDiagram-v2", items });
  }, [transitions, stateDecls, stateDescs, notes, rawItems]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try { await onSave(buildSource()); }
    finally { setSaving(false); }
  }, [saving, buildSource, onSave]);

  // --- Transition mutations ---
  const addTransition = () =>
    setTransitions((prev) => [...prev, { id: uid(), type: "transition", from: "", to: "" }]);

  const addInitialTransition = () =>
    setTransitions((prev) => [...prev, { id: uid(), type: "transition", from: "[*]", to: knownStates[0] ?? "State1" }]);

  const addFinalTransition = () =>
    setTransitions((prev) => [...prev, { id: uid(), type: "transition", from: knownStates[0] ?? "State1", to: "[*]" }]);

  const updateTransition = (id: string, patch: Partial<TransitionRow>) =>
    setTransitions((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t));

  const deleteTransition = (id: string) =>
    setTransitions((prev) => prev.filter((t) => t.id !== id));

  // --- State declaration mutations ---
  const addStateDecl = () =>
    setStateDecls((prev) => [...prev, { id: uid(), type: "state", name: `State${prev.length + 1}` }]);

  const updateStateDecl = (id: string, patch: Partial<StateDeclRow>) =>
    setStateDecls((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));

  const deleteStateDecl = (id: string) =>
    setStateDecls((prev) => prev.filter((s) => s.id !== id));

  // --- State description mutations ---
  const addStateDesc = () =>
    setStateDescs((prev) => [...prev, { id: uid(), type: "state-desc", name: knownStates[0] ?? "State1", description: "" }]);

  const updateStateDesc = (id: string, patch: Partial<StateDescRow>) =>
    setStateDescs((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));

  const deleteStateDesc = (id: string) =>
    setStateDescs((prev) => prev.filter((s) => s.id !== id));

  // --- Note mutations ---
  const addNote = () =>
    setNotes((prev) => [...prev, { id: uid(), type: "note", position: "right of", state: knownStates[0] ?? "State1", text: "" }]);

  const updateNote = (id: string, patch: Partial<NoteRow>) =>
    setNotes((prev) => prev.map((n) => n.id === id ? { ...n, ...patch } : n));

  const deleteNote = (id: string) =>
    setNotes((prev) => prev.filter((n) => n.id !== id));

  const stateInput = (value: string, onChange: (v: string) => void, placeholder: string, listId: string) => (
    <>
      <input
        className="mge-seq-input"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <datalist id={listId}>
        <option value="[*]" />
        {knownStates.map((n) => <option key={n} value={n} />)}
      </datalist>
    </>
  );

  return (
    <div className="mge-seq-editor">
      <div className="mge-seq-toolbar">
        <button className="mge-seq-btn mge-seq-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </button>
        <button className="mge-seq-btn" onClick={onCancel} disabled={saving}>キャンセル</button>
      </div>

      <div className="mge-seq-body">

        {/* ── Transitions ── */}
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Transitions</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addTransition}>+ 遷移</button>
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addInitialTransition}>[*] →</button>
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addFinalTransition}>→ [*]</button>
            </div>
          </div>
          {transitions.length === 0 && <p className="mge-seq-empty">遷移なし。+ で追加。</p>}
          {transitions.map((t) => (
            <div key={t.id} className="mge-seq-row">
              {stateInput(t.from, (v) => updateTransition(t.id, { from: v }), "From", `mge-sta-from-${t.id}`)}
              <span className="mge-seq-row-label">→</span>
              {stateInput(t.to, (v) => updateTransition(t.id, { to: v }), "To", `mge-sta-to-${t.id}`)}
              <span className="mge-seq-row-label">:</span>
              <input
                className="mge-seq-input mge-seq-input-wide"
                value={t.label ?? ""}
                onChange={(e) => updateTransition(t.id, { label: e.target.value || undefined })}
                placeholder="label (optional)"
              />
              <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => deleteTransition(t.id)}>×</button>
            </div>
          ))}
        </section>

        {/* ── State Declarations ── */}
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">State Declarations</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addStateDecl}>+ state</button>
            </div>
          </div>
          {stateDecls.length === 0 && <p className="mge-seq-empty">明示的な宣言なし。</p>}
          {stateDecls.map((s) => (
            <div key={s.id} className="mge-seq-row">
              <span className="mge-seq-badge">state</span>
              <input
                className="mge-seq-input"
                value={s.name}
                onChange={(e) => updateStateDecl(s.id, { name: e.target.value })}
                placeholder="StateName"
              />
              <input
                className="mge-seq-input mge-seq-input-wide"
                value={s.description ?? ""}
                onChange={(e) => updateStateDecl(s.id, { description: e.target.value || undefined })}
                placeholder="description (optional)"
              />
              <input
                className="mge-seq-input"
                value={s.annotation ?? ""}
                onChange={(e) => updateStateDecl(s.id, { annotation: e.target.value || undefined })}
                placeholder="<<annotation>> (optional)"
              />
              <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => deleteStateDecl(s.id)}>×</button>
            </div>
          ))}
        </section>

        {/* ── State Descriptions ── */}
        {(stateDescs.length > 0 || false) && (
          <section className="mge-seq-section">
            <div className="mge-seq-section-header">
              <span className="mge-seq-section-title">State Descriptions</span>
              <div className="mge-seq-add-btns">
                <button className="mge-seq-btn mge-seq-btn-sm" onClick={addStateDesc}>+ description</button>
              </div>
            </div>
            {stateDescs.map((s) => (
              <div key={s.id} className="mge-seq-row">
                <span className="mge-seq-badge">desc</span>
                {stateInput(s.name, (v) => updateStateDesc(s.id, { name: v }), "StateName", `mge-sta-desc-${s.id}`)}
                <span className="mge-seq-row-label">:</span>
                <input
                  className="mge-seq-input mge-seq-input-wide"
                  value={s.description}
                  onChange={(e) => updateStateDesc(s.id, { description: e.target.value })}
                  placeholder="description text"
                />
                <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => deleteStateDesc(s.id)}>×</button>
              </div>
            ))}
          </section>
        )}
        {stateDescs.length === 0 && (
          <div className="mge-seq-section">
            <div className="mge-seq-section-header">
              <span className="mge-seq-section-title">State Descriptions</span>
              <div className="mge-seq-add-btns">
                <button className="mge-seq-btn mge-seq-btn-sm" onClick={addStateDesc}>+ description</button>
              </div>
            </div>
            <p className="mge-seq-empty">状態の説明文なし。</p>
          </div>
        )}

        {/* ── Notes ── */}
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Notes</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addNote}>+ note</button>
            </div>
          </div>
          {notes.length === 0 && <p className="mge-seq-empty">ノートなし。</p>}
          {notes.map((n) => (
            <div key={n.id} className="mge-seq-row">
              <span className="mge-seq-badge">Note</span>
              <select
                className="mge-seq-select"
                value={n.position}
                onChange={(e) => updateNote(n.id, { position: e.target.value as NotePosition })}
              >
                {NOTE_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              {stateInput(n.state, (v) => updateNote(n.id, { state: v }), "StateName", `mge-sta-note-${n.id}`)}
              <span className="mge-seq-row-label">:</span>
              <input
                className="mge-seq-input mge-seq-input-wide"
                value={n.text}
                onChange={(e) => updateNote(n.id, { text: e.target.value })}
                placeholder="note text"
              />
              <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => deleteNote(n.id)}>×</button>
            </div>
          ))}
        </section>

        {/* ── Raw lines ── */}
        {rawItems.length > 0 && (
          <section className="mge-seq-section">
            <div className="mge-seq-section-header">
              <span className="mge-seq-section-title">未解析行 (read-only)</span>
            </div>
            {rawItems.map((r, idx) => (
              <div key={idx} className="mge-seq-row mge-seq-row-raw">
                <span className="mge-seq-badge mge-seq-badge-raw">raw</span>
                <code className="mge-seq-raw-line">{r.line.trim()}</code>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
};
