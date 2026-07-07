import { useCallback, useMemo, useState } from "react";
import { parseErDiagram } from "../../core/er/parser";
import { generateErDiagram } from "../../core/er/generator";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import { useT } from "../EditorHostContext";
import type { ErDiagramIR, ErEntity, ErRelationship, ErLineStyle } from "../../core/er/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

const LEFT_CARDS = ["||", "|o", "}|", "}o"] as const;
const RIGHT_CARDS = ["||", "o|", "|{", "o{"] as const;
const CARD_LABEL: Record<string, string> = {
  "||": "1 (exactly one)",
  "|o": "0..1 (zero or one)",
  "o|": "0..1 (zero or one)",
  "}|": "1..* (one or more)",
  "|{": "1..* (one or more)",
  "}o": "0..* (zero or more)",
  "o{": "0..* (zero or more)",
};

function seed(source: string): ErDiagramIR {
  const out = parseErDiagram(source);
  if (out.ok) return out.ir;
  return { kind: "erDiagram", entities: [], items: [] };
}

export const ERDiagramEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const t = useT();
  const [ir, setIr] = useState<ErDiagramIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);

  const currentSource = useMemo(() => generateErDiagram(ir), [ir]);

  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const out = parseErDiagram(next);
    if (!out.ok) return { ok: false, error: out.message };
    setIr(out.ir);
    return { ok: true };
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try { await onSave(currentSource); } finally { setSaving(false); }
  }, [saving, currentSource, onSave]);

  // --- Entity operations ---
  const addEntity = () => {
    const name = `Entity${ir.entities.length + 1}`;
    setIr((p) => ({ ...p, entities: [...p.entities, { name, attributes: [] }] }));
  };

  const removeEntity = (idx: number) => {
    setIr((p) => ({ ...p, entities: p.entities.filter((_, i) => i !== idx) }));
  };

  const updateEntityName = (idx: number, name: string) => {
    setIr((p) => ({
      ...p,
      entities: p.entities.map((e, i) => (i === idx ? { ...e, name } : e)),
    }));
  };

  const addAttribute = (entityIdx: number) => {
    setIr((p) => ({
      ...p,
      entities: p.entities.map((e, i) =>
        i === entityIdx
          ? { ...e, attributes: [...e.attributes, { type: "string", name: "attr", keys: [] }] }
          : e
      ),
    }));
  };

  const removeAttribute = (entityIdx: number, attrIdx: number) => {
    setIr((p) => ({
      ...p,
      entities: p.entities.map((e, i) =>
        i === entityIdx
          ? { ...e, attributes: e.attributes.filter((_, j) => j !== attrIdx) }
          : e
      ),
    }));
  };

  const updateAttribute = (
    entityIdx: number,
    attrIdx: number,
    field: "type" | "name" | "comment",
    value: string
  ) => {
    setIr((p) => ({
      ...p,
      entities: p.entities.map((e, i) =>
        i === entityIdx
          ? {
              ...e,
              attributes: e.attributes.map((a, j) =>
                j === attrIdx
                  ? { ...a, [field]: field === "comment" ? (value || undefined) : value }
                  : a
              ),
            }
          : e
      ),
    }));
  };

  const toggleAttrKey = (entityIdx: number, attrIdx: number, key: string) => {
    setIr((p) => ({
      ...p,
      entities: p.entities.map((e, i) =>
        i === entityIdx
          ? {
              ...e,
              attributes: e.attributes.map((a, j) =>
                j === attrIdx
                  ? {
                      ...a,
                      keys: a.keys.includes(key)
                        ? a.keys.filter((k) => k !== key)
                        : [...a.keys, key],
                    }
                  : a
              ),
            }
          : e
      ),
    }));
  };

  // --- Relationship operations ---
  const relationships = ir.items.filter((it): it is ErRelationship => it.type === "relationship");
  const rawItems = ir.items.filter((it) => it.type === "raw");

  const setRelationships = (rels: ErRelationship[]) => {
    setIr((p) => ({ ...p, items: [...rels, ...rawItems] }));
  };

  const addRelationship = () => {
    const left = ir.entities[0]?.name ?? "EntityA";
    const right = ir.entities[1]?.name ?? "EntityB";
    setRelationships([
      ...relationships,
      { type: "relationship", leftEntity: left, leftCard: "||", lineStyle: "--", rightCard: "|{", rightEntity: right, label: "" },
    ]);
  };

  const removeRelationship = (idx: number) => {
    setRelationships(relationships.filter((_, i) => i !== idx));
  };

  const updateRelationship = <K extends keyof ErRelationship>(
    idx: number,
    field: K,
    value: ErRelationship[K]
  ) => {
    setRelationships(relationships.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));
  };

  return (
    <EditorShell
      diagramKind="erDiagram"
      currentSource={currentSource}
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      renderMermaid={renderMermaid}
      onSourceEdit={handleSourceEdit}
    >
      <div className="mge-seq-body">
        {/* Entities */}
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Entities</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addEntity}>+ entity</button>
            </div>
          </div>
          {ir.entities.length === 0 && (
            <p className="mge-seq-empty">{t.er.entitiesEmpty}</p>
          )}
          {ir.entities.map((entity: ErEntity, eidx: number) => (
            <div key={eidx} className="mge-er-entity">
              <div className="mge-seq-row">
                <span className="mge-seq-badge">entity</span>
                <input
                  className="mge-seq-input mge-seq-input-wide"
                  value={entity.name}
                  onChange={(e) => updateEntityName(eidx, e.target.value)}
                  placeholder="EntityName"
                />
                <button
                  className="mge-seq-btn mge-seq-btn-sm"
                  onClick={() => addAttribute(eidx)}
                >+ attr</button>
                <button
                  className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
                  onClick={() => removeEntity(eidx)}
                >×</button>
              </div>
              {entity.attributes.map((attr, aidx) => (
                <div key={aidx} className="mge-seq-row mge-er-attr-row">
                  <input
                    className="mge-seq-input"
                    value={attr.type}
                    onChange={(e) => updateAttribute(eidx, aidx, "type", e.target.value)}
                    placeholder="type"
                    style={{ width: "80px" }}
                  />
                  <input
                    className="mge-seq-input"
                    value={attr.name}
                    onChange={(e) => updateAttribute(eidx, aidx, "name", e.target.value)}
                    placeholder="name"
                    style={{ width: "100px" }}
                  />
                  {(["PK", "FK", "UK"] as const).map((key) => (
                    <label key={key} className="mge-er-key-label">
                      <input
                        type="checkbox"
                        checked={attr.keys.includes(key)}
                        onChange={() => toggleAttrKey(eidx, aidx, key)}
                      />
                      {key}
                    </label>
                  ))}
                  <input
                    className="mge-seq-input mge-seq-input-wide"
                    value={attr.comment ?? ""}
                    onChange={(e) => updateAttribute(eidx, aidx, "comment", e.target.value)}
                    placeholder="comment (optional)"
                  />
                  <button
                    className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
                    onClick={() => removeAttribute(eidx, aidx)}
                  >×</button>
                </div>
              ))}
            </div>
          ))}
        </section>

        {/* Relationships */}
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Relationships</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addRelationship}>+ relation</button>
            </div>
          </div>
          {relationships.length === 0 && (
            <p className="mge-seq-empty">{t.er.relationshipsEmpty}</p>
          )}
          {relationships.map((rel: ErRelationship, ridx: number) => (
            <div key={ridx} className="mge-seq-row mge-er-rel-row">
              <input
                className="mge-seq-input"
                value={rel.leftEntity}
                onChange={(e) => updateRelationship(ridx, "leftEntity", e.target.value)}
                placeholder="Left entity"
                style={{ width: "100px" }}
              />
              <select
                className="mge-seq-select"
                value={rel.leftCard}
                onChange={(e) => updateRelationship(ridx, "leftCard", e.target.value)}
              >
                {LEFT_CARDS.map((c) => (
                  <option key={c} value={c}>{c} — {CARD_LABEL[c]}</option>
                ))}
              </select>
              <select
                className="mge-seq-select"
                value={rel.lineStyle}
                onChange={(e) => updateRelationship(ridx, "lineStyle", e.target.value as ErLineStyle)}
              >
                <option value="--">── solid</option>
                <option value="..">·· dotted</option>
              </select>
              <select
                className="mge-seq-select"
                value={rel.rightCard}
                onChange={(e) => updateRelationship(ridx, "rightCard", e.target.value)}
              >
                {RIGHT_CARDS.map((c) => (
                  <option key={c} value={c}>{c} — {CARD_LABEL[c]}</option>
                ))}
              </select>
              <input
                className="mge-seq-input"
                value={rel.rightEntity}
                onChange={(e) => updateRelationship(ridx, "rightEntity", e.target.value)}
                placeholder="Right entity"
                style={{ width: "100px" }}
              />
              <span className="mge-seq-row-label">:</span>
              <input
                className="mge-seq-input mge-seq-input-wide"
                value={rel.label}
                onChange={(e) => updateRelationship(ridx, "label", e.target.value)}
                placeholder="label"
              />
              <button
                className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
                onClick={() => removeRelationship(ridx)}
              >×</button>
            </div>
          ))}
          {rawItems.map((item, idx) => (
            <div key={`raw-${idx}`} className="mge-seq-row mge-seq-row-raw">
              <span className="mge-seq-badge mge-seq-badge-raw">raw</span>
              <code className="mge-seq-raw-line">{item.line.trim()}</code>
            </div>
          ))}
        </section>
      </div>
    </EditorShell>
  );
};
