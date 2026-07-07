import { useState, useCallback } from "react";
import { EditorShell } from "./EditorShell";
import { useT } from "./EditorHostContext";
import type { DiagramKind } from "../core/diagram-kind";

interface Props {
  /** Raw Mermaid block body (without fences, GUI metadata already stripped). */
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
  /** Detected kind — this editor is a fallback shared by several kinds
   *  (treemap-beta, venn-beta, unrecognised text), so panel-size preferences
   *  must be namespaced by the actual kind rather than a single shared key. */
  kind: DiagramKind;
}

/**
 * Minimal fallback editor for diagram types not yet supported by the GUI.
 * The body is a free-form textarea; the shared shell still gives the user a
 * draggable toolbar, a live Mermaid preview, and a read-only mirror of the
 * source. Editing happens in the body textarea so the mirror updates as the
 * user types — handy when verifying small syntax tweaks against the rendered
 * diagram.
 */
export const SourceOnlyEditor = ({ initialSource, onSave, onCancel, renderMermaid, kind }: Props) => {
  const t = useT();
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
    <EditorShell
      diagramKind={kind}
      currentSource={source}
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      renderMermaid={renderMermaid}
      previewUnavailableMessage={t.sourceOnly.previewUnavailable}
    >
      <textarea
        className="mge-source-only-textarea"
        value={source}
        onChange={(e) => setSource(e.target.value)}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
      />
    </EditorShell>
  );
};
