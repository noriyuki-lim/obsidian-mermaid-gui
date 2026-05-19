import { useState, useCallback } from "react";

interface Props {
  /** Raw Mermaid block body (without fences, GUI metadata already stripped). */
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Minimal fallback editor for diagram types not yet supported by the GUI.
 * Presents a plain textarea so the user can still edit and save the source.
 */
export const SourceOnlyEditor = ({ initialSource, onSave, onCancel }: Props) => {
  const [source, setSource] = useState(initialSource);
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(source);
    } finally {
      setSaving(false);
    }
  }, [source, onSave, saving]);

  return (
    <div className="mge-source-only">
      <div className="mge-source-only-toolbar">
        <button
          className="mge-btn mge-btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "保存中…" : "保存"}
        </button>
        <button
          className="mge-btn"
          onClick={onCancel}
          disabled={saving}
        >
          キャンセル
        </button>
      </div>
      <textarea
        className="mge-source-only-textarea"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
      />
    </div>
  );
};
