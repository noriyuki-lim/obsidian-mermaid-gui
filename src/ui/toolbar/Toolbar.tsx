import type { Direction } from "../../core/ir-types";
import { useEditorStore } from "../EditorContext";

interface Props {
  onSave: () => void;
  onCancel: () => void;
  onExportSvg?: () => void;
  saving?: boolean;
}

/**
 * Toolbar for the Modal-hosted editor. File-IO actions from the original Web
 * shell are handled by Obsidian (vault writes happen in the plugin layer), so
 * we only expose what is meaningful inside a single block: direction, history,
 * auto-layout, subgraph creation, optional SVG export, and Save / Cancel.
 */
export const Toolbar = ({ onSave, onCancel, onExportSvg, saving }: Props) => {
  const direction = useEditorStore((s) => s.ir.direction);
  const setDirection = useEditorStore((s) => s.setDirection);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const past = useEditorStore((s) => s.past.length);
  const future = useEditorStore((s) => s.future.length);
  const autoLayout = useEditorStore((s) => s.autoLayout);
  const addSubgraph = useEditorStore((s) => s.addSubgraph);

  return (
    <header className="mge-toolbar">
      <span className="mge-brand">Mermaid GUI</span>

      <div className="mge-group">
        <label htmlFor="mge-dir">Direction</label>
        <select
          id="mge-dir"
          value={direction}
          onChange={(e) => setDirection(e.target.value as Direction)}
        >
          <option value="TD">Top-Down</option>
          <option value="LR">Left-Right</option>
          <option value="BT">Bottom-Top</option>
          <option value="RL">Right-Left</option>
        </select>
      </div>

      <span className="mge-sep" />

      <div className="mge-group">
        <button onClick={undo} disabled={past === 0} title="Undo">
          Undo
        </button>
        <button onClick={redo} disabled={future === 0} title="Redo">
          Redo
        </button>
        <button onClick={autoLayout} title="Auto-layout via Dagre">
          Auto-layout
        </button>
        <button
          onClick={() => addSubgraph()}
          title="Wrap selected nodes in a new subgraph"
        >
          Subgraph
        </button>
        {onExportSvg ? (
          <button onClick={onExportSvg} title="Export SVG to vault attachment">
            Export SVG
          </button>
        ) : null}
      </div>

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
