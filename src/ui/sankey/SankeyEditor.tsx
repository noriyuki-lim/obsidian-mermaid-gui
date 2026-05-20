import { useCallback, useState } from "react";
import { parseSankey } from "../../core/sankey/parser";
import { generateSankey } from "../../core/sankey/generator";
import type { SankeyIR, SankeyItem } from "../../core/sankey/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
}

const seed = (initialSource: string): SankeyIR => {
  const outcome = parseSankey(initialSource);
  if (outcome.ok) return outcome.ir;
  return { kind: "sankey-beta", hasHeaderRow: false, items: [] };
};

export const SankeyEditor = ({ initialSource, onSave, onCancel }: Props) => {
  const [ir, setIr] = useState<SankeyIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);

  const updateItem = (index: number, patch: Partial<SankeyItem>) => {
    setIr((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? ({ ...item, ...patch } as SankeyItem) : item,
      ),
    }));
  };

  const deleteItem = (index: number) => {
    setIr((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const addLink = () => {
    setIr((prev) => ({
      ...prev,
      items: [...prev.items, { type: "link", source: "A", target: "B", value: 1 }],
    }));
  };

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(generateSankey(ir));
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
            <label className="mge-seq-row-label">
              <input
                type="checkbox"
                checked={ir.hasHeaderRow}
                onChange={(e) => setIr({ ...ir, hasHeaderRow: e.target.checked })}
              />{" "}
              CSVヘッダ行 `source,target,value` を出力
            </label>
          </div>
        </section>

        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Links</span>
            <div className="mge-seq-add-btns">
              <button className="mge-seq-btn mge-seq-btn-sm" onClick={addLink}>
                + link
              </button>
            </div>
          </div>
          {ir.items.filter((i) => i.type === "link").length === 0 && (
            <p className="mge-seq-empty">リンクが未定義。+ で追加。</p>
          )}
          {ir.items.map((item, idx) => {
            if (item.type === "link") {
              return (
                <div key={idx} className="mge-seq-row">
                  <input
                    className="mge-seq-input mge-seq-input-wide"
                    value={item.source}
                    onChange={(e) => updateItem(idx, { source: e.target.value })}
                    placeholder="source"
                  />
                  <span className="mge-seq-row-label">→</span>
                  <input
                    className="mge-seq-input mge-seq-input-wide"
                    value={item.target}
                    onChange={(e) => updateItem(idx, { target: e.target.value })}
                    placeholder="target"
                  />
                  <span className="mge-seq-row-label">:</span>
                  <input
                    className="mge-seq-input"
                    type="number"
                    step="any"
                    value={item.value}
                    onChange={(e) =>
                      updateItem(idx, { value: Number(e.target.value) })
                    }
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
