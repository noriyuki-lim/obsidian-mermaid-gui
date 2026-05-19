import { useState, useCallback } from "react";
import { parseClassDiagram } from "../../core/class/parser";
import { generateClassDiagram } from "../../core/class/generator";
import type {
  ClassDiagramItem,
  ClassNote,
  ClassRelation,
  RawItem,
  Visibility,
} from "../../core/class/ir-types";

interface Props {
  /** Mermaid block body (without fences, GUI metadata already stripped). */
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
}

// UI-internal class state (richer than IR for easier editing)
interface ClassState {
  id: string;
  name: string;
  annotation: string;
  members: Array<{ id: string; visibility: Visibility; text: string; isMethod: boolean }>;
}

let _idCounter = 0;
const uid = () => String(++_idCounter);

const ANNOTATIONS = ["", "interface", "abstract", "service", "enumeration"];

const RELATION_TYPES = [
  { sym: "<|--", label: "<|-- inheritance" },
  { sym: "--|>", label: "--|> inheritance" },
  { sym: "*--", label: "*-- composition" },
  { sym: "--*", label: "--* composition" },
  { sym: "o--", label: "o-- aggregation" },
  { sym: "--o", label: "--o aggregation" },
  { sym: "-->", label: "--> association" },
  { sym: "<--", label: "<-- association" },
  { sym: "--",  label: "-- link" },
  { sym: "..>", label: "..> dependency" },
  { sym: "<..", label: "<.. dependency" },
  { sym: "..|>", label: "..|> realization" },
  { sym: "..",  label: ".. realization" },
];

const VISIBILITIES: Array<{ v: Visibility; label: string }> = [
  { v: "+", label: "+ public" },
  { v: "-", label: "- private" },
  { v: "#", label: "# protected" },
  { v: "~", label: "~ package" },
  { v: "",  label: "  (none)" },
];

// ---------------------------------------------------------------------------
// Initialise structured state from parsed IR
// ---------------------------------------------------------------------------
const initState = (items: ClassDiagramItem[]) => {
  const classMap = new Map<string, ClassState>();
  const relations: ClassRelation[] = [];
  const notes: ClassNote[] = [];
  const rawItems: RawItem[] = [];

  for (const item of items) {
    if (item.type === "class") {
      if (!classMap.has(item.name)) {
        classMap.set(item.name, { id: uid(), name: item.name, annotation: item.annotation ?? "", members: [] });
      } else if (item.annotation) {
        classMap.get(item.name)!.annotation = item.annotation;
      }
    } else if (item.type === "member") {
      if (!classMap.has(item.className)) {
        classMap.set(item.className, { id: uid(), name: item.className, annotation: "", members: [] });
      }
      classMap.get(item.className)!.members.push({ id: uid(), visibility: item.visibility, text: item.text, isMethod: item.isMethod });
    } else if (item.type === "relation") {
      relations.push(item);
    } else if (item.type === "note") {
      notes.push(item);
    } else if (item.type === "raw") {
      rawItems.push(item);
    }
  }

  return { classes: Array.from(classMap.values()), relations, notes, rawItems };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export const ClassEditor = ({ initialSource, onSave, onCancel }: Props) => {
  const parsed = parseClassDiagram(initialSource);
  const init = parsed.ok ? initState(parsed.ir.items) : { classes: [], relations: [], notes: [], rawItems: [] };

  const [classes, setClasses] = useState<ClassState[]>(init.classes);
  const [relations, setRelations] = useState<ClassRelation[]>(init.relations);
  const [notes, setNotes] = useState<ClassNote[]>(init.notes);
  const rawItems = init.rawItems; // never mutated through GUI
  const [saving, setSaving] = useState(false);

  const classNames = classes.map((c) => c.name);

  // Build IR and generate source
  const buildSource = useCallback(() => {
    const items: ClassDiagramItem[] = [];
    for (const cls of classes) {
      items.push({ type: "class", name: cls.name, annotation: cls.annotation || undefined });
      for (const m of cls.members) {
        items.push({ type: "member", className: cls.name, visibility: m.visibility, text: m.text, isMethod: m.isMethod });
      }
    }
    for (const rel of relations) items.push(rel);
    for (const note of notes) items.push(note);
    for (const raw of rawItems) items.push(raw);
    return generateClassDiagram({ kind: "classDiagram", items });
  }, [classes, relations, notes, rawItems]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try { await onSave(buildSource()); }
    finally { setSaving(false); }
  }, [saving, buildSource, onSave]);

  // --- Class mutations ---
  const addClass = () => {
    setClasses((prev) => [...prev, { id: uid(), name: `Class${prev.length + 1}`, annotation: "", members: [] }]);
  };

  const deleteClass = (id: string) => setClasses((prev) => prev.filter((c) => c.id !== id));

  const updateClass = (id: string, patch: Partial<Pick<ClassState, "name" | "annotation">>) => {
    setClasses((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
  };

  const addMember = (classId: string) => {
    setClasses((prev) =>
      prev.map((c) =>
        c.id === classId
          ? { ...c, members: [...c.members, { id: uid(), visibility: "+", text: "attribute", isMethod: false }] }
          : c,
      ),
    );
  };

  const updateMember = (classId: string, memberId: string, patch: Partial<ClassState["members"][0]>) => {
    setClasses((prev) =>
      prev.map((c) =>
        c.id === classId
          ? { ...c, members: c.members.map((m) => m.id === memberId ? { ...m, ...patch } : m) }
          : c,
      ),
    );
  };

  const deleteMember = (classId: string, memberId: string) => {
    setClasses((prev) =>
      prev.map((c) =>
        c.id === classId ? { ...c, members: c.members.filter((m) => m.id !== memberId) } : c,
      ),
    );
  };

  // --- Relation mutations ---
  const addRelation = () => {
    const from = classNames[0] ?? "ClassA";
    const to = classNames[1] ?? "ClassB";
    setRelations((prev) => [...prev, { type: "relation", from, to, relation: "<|--" }]);
  };

  const updateRelation = (idx: number, patch: Partial<ClassRelation>) => {
    setRelations((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const deleteRelation = (idx: number) => setRelations((prev) => prev.filter((_, i) => i !== idx));

  // --- Note mutations ---
  const addNote = () => setNotes((prev) => [...prev, { type: "note", text: "" }]);
  const updateNote = (idx: number, patch: Partial<ClassNote>) => {
    setNotes((prev) => prev.map((n, i) => i === idx ? { ...n, ...patch } : n));
  };
  const deleteNote = (idx: number) => setNotes((prev) => prev.filter((_, i) => i !== idx));

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="mge-seq-editor">
      <div className="mge-seq-toolbar">
        <button className="mge-seq-btn mge-seq-btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </button>
        <button className="mge-seq-btn" onClick={onCancel} disabled={saving}>キャンセル</button>
      </div>

      <div className="mge-seq-body">

        {/* ── Classes ── */}
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Classes</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addClass}>+ class</button>
            </div>
          </div>
          {classes.length === 0 && <p className="mge-seq-empty">クラスなし。+ で追加。</p>}
          {classes.map((cls) => (
            <div key={cls.id} className="mge-cls-card">
              {/* Class header */}
              <div className="mge-cls-card-header">
                <span className="mge-seq-badge">class</span>
                <input
                  className="mge-seq-input"
                  value={cls.name}
                  onChange={(e) => updateClass(cls.id, { name: e.target.value })}
                  placeholder="ClassName"
                />
                <select
                  className="mge-seq-select"
                  value={cls.annotation}
                  onChange={(e) => updateClass(cls.id, { annotation: e.target.value })}
                >
                  {ANNOTATIONS.map((a) => (
                    <option key={a} value={a}>{a ? `<<${a}>>` : "(annotation)"}</option>
                  ))}
                </select>
                <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => deleteClass(cls.id)}>×</button>
              </div>
              {/* Members */}
              {cls.members.map((m) => (
                <div key={m.id} className="mge-cls-member-row">
                  <select
                    className="mge-seq-select mge-cls-vis-select"
                    value={m.visibility}
                    onChange={(e) => updateMember(cls.id, m.id, { visibility: e.target.value as Visibility })}
                  >
                    {VISIBILITIES.map(({ v, label }) => <option key={v} value={v}>{label}</option>)}
                  </select>
                  <input
                    className="mge-seq-input mge-seq-input-wide"
                    value={m.text}
                    onChange={(e) => {
                      const text = e.target.value;
                      updateMember(cls.id, m.id, { text, isMethod: text.includes("(") });
                    }}
                    placeholder="type name  or  method()"
                  />
                  <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => deleteMember(cls.id, m.id)}>×</button>
                </div>
              ))}
              {/* Add member footer */}
              <div className="mge-cls-card-footer">
                <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => addMember(cls.id)}>+ member</button>
              </div>
            </div>
          ))}
        </section>

        {/* ── Relations ── */}
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Relations</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addRelation}>+ relation</button>
            </div>
          </div>
          {relations.length === 0 && <p className="mge-seq-empty">関係なし。+ で追加。</p>}
          {relations.map((rel, idx) => (
            <div key={idx} className="mge-seq-row">
              <input
                className="mge-seq-input"
                list={`mge-cls-classes-${idx}`}
                value={rel.from}
                onChange={(e) => updateRelation(idx, { from: e.target.value })}
                placeholder="From"
              />
              <datalist id={`mge-cls-classes-${idx}`}>
                {classNames.map((n) => <option key={n} value={n} />)}
              </datalist>
              <select
                className="mge-seq-select"
                value={rel.relation}
                onChange={(e) => updateRelation(idx, { relation: e.target.value })}
              >
                {RELATION_TYPES.map(({ sym, label }) => (
                  <option key={sym} value={sym}>{label}</option>
                ))}
              </select>
              <input
                className="mge-seq-input"
                list={`mge-cls-classes-to-${idx}`}
                value={rel.to}
                onChange={(e) => updateRelation(idx, { to: e.target.value })}
                placeholder="To"
              />
              <datalist id={`mge-cls-classes-to-${idx}`}>
                {classNames.map((n) => <option key={n} value={n} />)}
              </datalist>
              <span className="mge-seq-row-label">:</span>
              <input
                className="mge-seq-input mge-seq-input-wide"
                value={rel.label ?? ""}
                onChange={(e) => updateRelation(idx, { label: e.target.value || undefined })}
                placeholder="label (optional)"
              />
              <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => deleteRelation(idx)}>×</button>
            </div>
          ))}
        </section>

        {/* ── Notes ── */}
        {(notes.length > 0 || true) && (
          <section className="mge-seq-section">
            <div className="mge-seq-section-header">
              <span className="mge-seq-section-title">Notes</span>
              <div className="mge-seq-add-btns">
                <button className="mge-seq-btn mge-seq-btn-sm" onClick={addNote}>+ note</button>
              </div>
            </div>
            {notes.length === 0 && <p className="mge-seq-empty">ノートなし。</p>}
            {notes.map((note, idx) => (
              <div key={idx} className="mge-seq-row">
                <span className="mge-seq-badge">note</span>
                <span className="mge-seq-row-label">for</span>
                <input
                  className="mge-seq-input"
                  list={`mge-cls-note-cls-${idx}`}
                  value={note.forClass ?? ""}
                  onChange={(e) => updateNote(idx, { forClass: e.target.value || undefined })}
                  placeholder="ClassName (optional)"
                />
                <datalist id={`mge-cls-note-cls-${idx}`}>
                  {classNames.map((n) => <option key={n} value={n} />)}
                </datalist>
                <span className="mge-seq-row-label">:</span>
                <input
                  className="mge-seq-input mge-seq-input-wide"
                  value={note.text}
                  onChange={(e) => updateNote(idx, { text: e.target.value })}
                  placeholder="note text"
                />
                <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => deleteNote(idx)}>×</button>
              </div>
            ))}
          </section>
        )}

        {/* ── Raw lines (read-only) ── */}
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
