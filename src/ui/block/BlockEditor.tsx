import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { parseBlock } from "../../core/block/parser";
import { generateBlock } from "../../core/block/generator";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import { BlockInteractivePreview } from "./BlockInteractivePreview";
import type { BlockIR, BlockItem, BlockNode } from "../../core/block/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

const SHAPES: Array<{ label: string; open: string; close: string }> = [
  { label: "[ ] square",    open: "[",  close: "]"  },
  { label: "( ) rounded",   open: "(",  close: ")"  },
  { label: "(( )) circle",  open: "((", close: "))" },
  { label: "[( )] cylinder",open: "[(", close: ")]" },
  { label: "> ] ribbon",    open: ">",  close: "]"  },
];

function seed(source: string): BlockIR {
  const out = parseBlock(source);
  if (out.ok) return out.ir;
  return { kind: "block-beta", items: [] };
}

function currentColumns(ir: BlockIR): number {
  for (const item of ir.items) {
    if (item.type === "columns") {
      const n = parseInt(item.count, 10);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 1;
}

export const BlockEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const [ir, setIr] = useState<BlockIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const currentSource = useMemo(() => generateBlock(ir), [ir]);
  const cols = currentColumns(ir);

  // ── keyboard: Delete/Backspace removes selected item ──────────────────────
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (selectedIdx === null) return;
      // Don't fire when focus is inside an input/select/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setIr((p) => ({ ...p, items: p.items.filter((_, j) => j !== selectedIdx) }));
        setSelectedIdx(null);
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [selectedIdx]);

  // ── IR mutations ──────────────────────────────────────────────────────────
  const updateItem = (i: number, patch: Partial<BlockItem>) => {
    setIr((p) => ({
      ...p,
      items: p.items.map((it, j) => (j === i ? ({ ...it, ...patch } as BlockItem) : it)),
    }));
  };

  const removeItem = (i: number) => {
    setIr((p) => ({ ...p, items: p.items.filter((_, j) => j !== i) }));
    setSelectedIdx((s) => {
      if (s === null) return null;
      if (s === i) return null;
      if (s > i) return s - 1;
      return s;
    });
  };

  /** Swap item at fromIdx into the position currently occupied by toIdx */
  const reorderItem = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setIr((p) => {
      const items = [...p.items];
      const moving = items.splice(fromIdx, 1)[0];
      const dest = fromIdx < toIdx ? toIdx - 1 : toIdx;
      items.splice(dest, 0, moving);
      return { ...p, items };
    });
    setSelectedIdx(toIdx < fromIdx ? toIdx : toIdx - 1);
  };

  const resizeSpan = (itemIdx: number, newSpan: number) => {
    const clampedSpan = Math.max(1, Math.min(cols, newSpan));
    setIr((p) => ({
      ...p,
      items: p.items.map((it, j) => {
        if (j !== itemIdx) return it;
        if (it.type === "block") return { ...it, span: clampedSpan === 1 ? undefined : clampedSpan };
        if (it.type === "space") return { ...it, span: clampedSpan === 1 ? undefined : clampedSpan };
        return it;
      }),
    }));
  };

  const addBlock = () => {
    setIr((p) => {
      const nextId = `b${p.items.filter((i) => i.type === "block").length + 1}`;
      const newItem: BlockItem = { type: "block", id: nextId, label: nextId, shapeOpen: "[", shapeClose: "]" };
      const items = [...p.items, newItem];
      setSelectedIdx(items.length - 1);
      return { ...p, items };
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

  // ── EditorShell contract ──────────────────────────────────────────────────
  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const out = parseBlock(next);
    if (!out.ok) return { ok: false, error: out.message };
    setIr(out.ir);
    setSelectedIdx(null);
    return { ok: true };
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try { await onSave(currentSource); } finally { setSaving(false); }
  }, [saving, currentSource, onSave]);

  // ── Selected item detail panel ─────────────────────────────────────────────
  const selectedItem = selectedIdx !== null ? ir.items[selectedIdx] : null;

  const detailPanel = (() => {
    if (!selectedItem) return null;

    if (selectedItem.type === "columns") {
      return (
        <div className="mge-block-detail-panel">
          <span className="mge-block-detail-title">columns</span>
          <div className="mge-seq-row">
            <span className="mge-seq-row-label">count</span>
            <input
              className="mge-seq-input"
              value={selectedItem.count}
              onChange={(e) => updateItem(selectedIdx!, { type: "columns", count: e.target.value })}
              placeholder="3 / auto"
              style={{ width: 80 }}
            />
          </div>
          <button
            className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
            onClick={() => removeItem(selectedIdx!)}
          >
            削除
          </button>
        </div>
      );
    }

    if (selectedItem.type === "block") {
      return (
        <div className="mge-block-detail-panel">
          <span className="mge-block-detail-title">block</span>
          <div className="mge-seq-row">
            <span className="mge-seq-row-label">id</span>
            <input
              className="mge-seq-input"
              value={selectedItem.id}
              onChange={(e) =>
                updateItem(selectedIdx!, {
                  type: "block",
                  id: e.target.value,
                  label: selectedItem.label,
                  shapeOpen: selectedItem.shapeOpen,
                  shapeClose: selectedItem.shapeClose,
                  span: selectedItem.span,
                })
              }
              style={{ width: 90 }}
            />
          </div>
          <div className="mge-seq-row">
            <span className="mge-seq-row-label">label</span>
            <input
              className="mge-seq-input mge-seq-input-wide"
              value={selectedItem.label ?? ""}
              onChange={(e) =>
                updateItem(selectedIdx!, {
                  type: "block",
                  id: selectedItem.id,
                  label: e.target.value || undefined,
                  shapeOpen: selectedItem.shapeOpen,
                  shapeClose: selectedItem.shapeClose,
                  span: selectedItem.span,
                })
              }
              placeholder="(id)"
            />
          </div>
          <div className="mge-seq-row">
            <span className="mge-seq-row-label">shape</span>
            <select
              className="mge-seq-select"
              value={currentShapeLabel(selectedItem)}
              onChange={(e) => updateShape(selectedIdx!, e.target.value)}
            >
              {SHAPES.map((s) => <option key={s.label} value={s.label}>{s.label}</option>)}
            </select>
          </div>
          <div className="mge-seq-row">
            <span className="mge-seq-row-label">span</span>
            <input
              className="mge-seq-input"
              type="number"
              min={1}
              max={cols}
              value={selectedItem.span ?? 1}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                resizeSpan(selectedIdx!, Number.isFinite(v) ? v : 1);
              }}
              style={{ width: 60 }}
            />
            <span className="mge-seq-row-label" style={{ marginLeft: 4 }}>/ {cols}</span>
          </div>
          <button
            className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
            onClick={() => removeItem(selectedIdx!)}
          >
            削除
          </button>
        </div>
      );
    }

    if (selectedItem.type === "space") {
      return (
        <div className="mge-block-detail-panel">
          <span className="mge-block-detail-title">space</span>
          <div className="mge-seq-row">
            <span className="mge-seq-row-label">span</span>
            <input
              className="mge-seq-input"
              type="number"
              min={1}
              max={cols}
              value={selectedItem.span ?? 1}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                resizeSpan(selectedIdx!, Number.isFinite(v) ? v : 1);
              }}
              style={{ width: 60 }}
            />
            <span className="mge-seq-row-label" style={{ marginLeft: 4 }}>/ {cols}</span>
          </div>
          <button
            className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
            onClick={() => removeItem(selectedIdx!)}
          >
            削除
          </button>
        </div>
      );
    }

    if (selectedItem.type === "raw") {
      return (
        <div className="mge-block-detail-panel">
          <span className="mge-block-detail-title">raw</span>
          <code className="mge-seq-raw-line">{selectedItem.line.trim()}</code>
          <button
            className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger"
            onClick={() => removeItem(selectedIdx!)}
          >
            削除
          </button>
        </div>
      );
    }

    return null;
  })();

  return (
    <div ref={shellRef} style={{ display: "contents" }}>
      <EditorShell
        currentSource={currentSource}
        onSave={handleSave}
        onCancel={onCancel}
        saving={saving}
        renderMermaid={renderMermaid}
        previewOverride={
          <BlockInteractivePreview
            ir={ir}
            selectedIdx={selectedIdx}
            onSelect={setSelectedIdx}
            onReorder={reorderItem}
            onResizeSpan={resizeSpan}
          />
        }
        onSourceEdit={handleSourceEdit}
      >
        {/* ── Toolbar row: add buttons ─────────────────────────────────── */}
        <div className="mge-seq-body">
          <section className="mge-seq-section">
            <div className="mge-seq-section-header">
              <span className="mge-seq-section-title">Block items</span>
              <div className="mge-seq-add-btns">
                <button className="mge-seq-btn mge-seq-btn-sm" onClick={addColumns}>+ columns</button>
                <button className="mge-seq-btn mge-seq-btn-sm" onClick={addBlock}>+ block</button>
                <button className="mge-seq-btn mge-seq-btn-sm" onClick={addSpace}>+ space</button>
              </div>
            </div>

            {ir.items.length === 0 && (
              <p className="mge-seq-empty">未定義。+ で追加するか、グリッドをドラッグ。</p>
            )}

            {/* Detail panel for selected item */}
            {detailPanel ?? (
              <p className="mge-block-select-hint">
                グリッド上のブロックをクリックして選択
              </p>
            )}
          </section>

          {/* Compact item list (read-only overview; clicking selects) */}
          <section className="mge-seq-section">
            <div className="mge-seq-section-header">
              <span className="mge-seq-section-title">一覧</span>
            </div>
            {ir.items.map((item, i) => {
              const isSelected = selectedIdx === i;
              return (
                <div
                  key={i}
                  className={`mge-seq-row mge-block-list-row${isSelected ? " mge-block-list-row-selected" : ""}`}
                  onClick={() => setSelectedIdx(isSelected ? null : i)}
                  style={{ cursor: "pointer" }}
                >
                  {item.type === "columns" && (
                    <>
                      <span className="mge-seq-badge">columns</span>
                      <span className="mge-seq-row-label">{item.count}</span>
                    </>
                  )}
                  {item.type === "block" && (
                    <>
                      <span className="mge-seq-badge">block</span>
                      <span className="mge-seq-row-label">{item.id}</span>
                      {item.label && <span className="mge-seq-raw-line">{item.label}</span>}
                      {item.span && <span className="mge-seq-badge mge-seq-badge-raw">:{item.span}</span>}
                    </>
                  )}
                  {item.type === "space" && (
                    <>
                      <span className="mge-seq-badge mge-seq-badge-raw">space</span>
                      {item.span && <span className="mge-seq-row-label">:{item.span}</span>}
                    </>
                  )}
                  {item.type === "raw" && (
                    <>
                      <span className="mge-seq-badge mge-seq-badge-raw">raw</span>
                      <code className="mge-seq-raw-line">{item.line.trim()}</code>
                    </>
                  )}
                </div>
              );
            })}
          </section>
        </div>
      </EditorShell>
    </div>
  );
};
