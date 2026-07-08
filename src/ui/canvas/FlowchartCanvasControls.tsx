import { Panel } from "@xyflow/react";
import type { EditorEdgeType } from "../../core/store-factory";
import { useEditorStore } from "../EditorContext";

const EDGE_TYPE_STORAGE_KEY = "mge:flowchart:editor-edge-type";

const saveEditorEdgeTypePreference = (edgeType: EditorEdgeType) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EDGE_TYPE_STORAGE_KEY, edgeType);
  } catch {
    // localStorage may be unavailable in restricted contexts; the in-session
    // setting still works because it lives in the editor store.
  }
};

export const FlowchartCanvasControls = () => {
  const editorEdgeType = useEditorStore((s) => s.editorEdgeType);
  const setEditorEdgeType = useEditorStore((s) => s.setEditorEdgeType);
  const autoLayout = useEditorStore((s) => s.autoLayout);

  const handleEditorEdgeTypeChange = (edgeType: EditorEdgeType) => {
    setEditorEdgeType(edgeType);
    saveEditorEdgeTypePreference(edgeType);
  };

  return (
    <Panel
      position="top-left"
      className="mge-flow-canvas-controls"
      aria-label="Flowchart canvas controls"
    >
      <select
        className="react-flow__controls-button mge-editor-edge-select"
        aria-label="Editor edge display"
        value={editorEdgeType}
        onChange={(e) => handleEditorEdgeTypeChange(e.target.value as EditorEdgeType)}
      >
        <option value="bezier">Edge: Bezier</option>
        <option value="smoothstep">Edge: Smooth step</option>
      </select>
      <button
        type="button"
        className="react-flow__controls-button mge-auto-layout-button"
        onClick={autoLayout}
        title="Auto-layout via Dagre"
      >
        Auto-layout
      </button>
    </Panel>
  );
};
