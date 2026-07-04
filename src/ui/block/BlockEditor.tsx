import { useCallback, useMemo, useState } from "react";
import { parseBlock } from "../../core/block/parser";
import { generateBlock } from "../../core/block/generator";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import type { BlockIR, BlockItem, BlockNode } from "../../core/block/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

const SHAPES: Array<{ label: string; open: string; close: string }> = [
  { label: "[ ] square", open: "[", close: "]" },
  { label: "( ) rounded", open: "(", close: ")" },
  { label: "(( )) circle", open: "((", close: "))" },
  { label: "[( )] cylinder", open: "[(", close: ")]" },
  { label: "> ] ribbon", open: ">", close: "]" },
];

function seed(source: string): BlockIR {
  const out = parseBlock(source);
  if (out.ok) return out.ir;
  return { kind: "block-beta", items: [] };
}

export const BlockEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const [ir, setIr] = useState<BlockIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);

  const currentSource = useMemo(() => generateBlock(ir), [ir]);

  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const out = parseBlock(next);
    if (!out.ok) return { ok: false, error: out.message };
    setIr(out.ir);
    return { ok: true };
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try { await onSave(currentSource); } finally { setSaving(false); }
  }, [saving, currentSource, onSave]);

  const updateItem = (i: number, patch: Partial<BlockItem>) => {
    setIr((p) => ({
      ...p,
      items: p.items.map((it, j) => (j === i ? ({ ...it, ...patch } as BlockItem) : it)),
    }));
  };

  const removeItem = (i: number) => {
    setIr((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }));
  };

  const moveItem = (i: number, dir: -1 | 1) => {
    const t = i + dir;
    if (t < 0 || t >= ir.items.length) return;
    setIr((p) => {
      const items = [...p.items];
      [items[i], items[t]] = [items[t], items[i]];
      return { ...p, items };
    });
  };

  const addBlock = () => {
    setIr((p) => {
      const nextId = `b${p.items.filter((i) => i.type === "block").length + 1}`;
      return {
        ...p,
        items: [...p.items, { type: "block", id: nextId, label: nextId, shapeOpen: "[", shapeClose: "]" }],
      };
    });
  };

  const addColumns = () => {
    setIr((p) => ({ ...p, items: [...p.items, { type: "columns", count: "3" }] }));
  };

  const addSpace = () => {
    setIr((p) => ({ ...p, items: [...p.items, { type: "space" }] }));
  };

  const updateShape = (i: number, shapeLabel: string) => {
    const shape = SHAPES.find((s) => s.label === shapeLabel);
    if (!shape) return;
    updateItem(i, { shapeOpen: shape.open, shapeClose: shape.close } as Partial<BlockNode>);
  };

  const currentShapeLabel = (item: BlockNode): string => {
    const m = SHAPES.find((s) => s.open === item.shapeOpen && s.close === item.shapeClose);
    return m?.label ?? SHAPES[0].label;
  };

  return (
    <EditorShell
      diagramKind="block-beta"
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
            <span className="mge-seq-section-title">Items</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addColumns}>+ columns</button>
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addBlock}>+ block</button>
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addSpace}>+ space</button>
            </div>
          </div>
          {ir.items.length === 0 && <p className="mge-seq-empty">未定義。+ で追加。</p>}
          {ir.items.map((item, i) => {
            if (item.type === "columns") {
              return (
                <div key={i} className="mge-seq-row">
                  <span className="mge-seq-badge">columns</span>
                  <input
                    className="mge-seq-input"
                    value={item.count}
                    onChange={(e) => updateItem(i, { type: "columns", count: e.target.value })}
                    placeholder="3 / auto"
                    style={{ width: 80 }}
                  />
                  <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => moveItem(i, -1)}>↑</button>
                  <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => moveItem(i, 1)}>↓</button>
                  <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => removeItem(i)}>×</button>
                </div>
              );
            }
            if (item.type === "block") {
              return (
                <div key={i} className="mge-seq-row">
                  <span className="mge-seq-badge">block</span>
                  <input
                    className="mge-seq-input"
                    value={item.id}
                    onChange={(e) => updateItem(i, { type: "block", id: e.target.value, label: item.label, shapeOpen: item.shapeOpen, shapeClose: item.shapeClose, span: item.span })}
                    placeholder="id"
                    style={{ width: 90 }}
                  />
                  <select
                    className="mge-seq-select"
                    value={currentShapeLabel(item)}
                    onChange={(e) => updateShape(i, e.target.value)}
                  >
                    {SHAPES.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
                  </select>
                  <input
                    className="mge-seq-input mge-seq-input-wide"
                    value={item.label ?? ""}
                    onChange={(e) => updateItem(i, { type: "block", id: item.id, label: e.target.value || undefined, shapeOpen: item.shapeOpen, shapeClose: item.shapeClose, span: item.span })}
                    placeholder="label"
                  />
                  <span className="mge-seq-row-label">span:</span>
                  <input
                    className="mge-seq-input"
                    type="number"
                    min={1}
                    value={item.span ?? ""}
                    onChange={(e) => updateItem(i, { type: "block", id: item.id, label: item.label, shapeOpen: item.shapeOpen, shapeClose: item.shapeClose, span: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                    placeholder="-"
                    style={{ width: 60 }}
                  />
                  <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => moveItem(i, -1)}>↑</button>
                  <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => moveItem(i, 1)}>↓</button>
                  <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => removeItem(i)}>×</button>
                </div>
              );
            }
            if (item.type === "space") {
              return (
                <div key={i} className="mge-seq-row">
                  <span className="mge-seq-badge">space</span>
                  <span className="mge-seq-row-label">span:</span>
                  <input
                    className="mge-seq-input"
                    type="number"
                    min={1}
                    value={item.span ?? ""}
                    onChange={(e) => updateItem(i, { type: "space", span: e.target.value ? parseInt(e.target.value, 10) : undefined })}
                    placeholder="-"
                    style={{ width: 60 }}
                  />
                  <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => moveItem(i, -1)}>↑</button>
                  <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => moveItem(i, 1)}>↓</button>
                  <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => removeItem(i)}>×</button>
                </div>
              );
            }
            return (
              <div key={i} className="mge-seq-row mge-seq-row-raw">
                <span className="mge-seq-badge mge-seq-badge-raw">raw</span>
                <code className="mge-seq-raw-line">{item.line.trim()}</code>
                <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => removeItem(i)}>×</button>
              </div>
            );
          })}
        </section>
      </div>
    </EditorShell>
  );
};
