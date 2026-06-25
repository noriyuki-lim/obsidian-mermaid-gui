import { useEditorStore } from "../EditorContext";
import { EditorActions } from "../EditorActions";

interface Props {
  onSave: () => void;
  onCancel: () => void;
  onExportSvg?: () => void;
  saving?: boolean;
}

/**
 * Toolbar for the Modal-hosted flowchart editor. Only diagram-agnostic actions
 * live here — Undo / Redo / Export (shared `EditorActions`, matching every
 * other editor's common bar) plus Save / Cancel. Flowchart structure controls
 * (Direction / Subgraph) live in the palette; Auto-layout stays on the canvas.
 */
export const Toolbar = ({ onSave, onCancel, onExportSvg, saving }: Props) => {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const past = useEditorStore((s) => s.past.length);
  const future = useEditorStore((s) => s.future.length);

  return (
    <header className="mge-toolbar">
      <span className="mge-brand">Mermaid GUI</span>

      <EditorActions
        onUndo={undo}
        onRedo={redo}
        canUndo={past > 0}
        canRedo={future > 0}
        onExport={onExportSvg}
      />

      <div className="mge-group" style={{ marginLeft: "auto" }}>
        <button className="mge-btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="mge-btn-primary" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </header>
  );
};
