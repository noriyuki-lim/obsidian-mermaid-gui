import { Panel } from "@xyflow/react";
import type { FlowchartCurve } from "../../core/ir-types";
import { useEditorStore } from "../EditorContext";

export const FlowchartCanvasControls = () => {
  const curve = useEditorStore((s) => s.ir.curve);
  const setCurve = useEditorStore((s) => s.setCurve);
  const autoLayout = useEditorStore((s) => s.autoLayout);

  return (
    <Panel
      position="top-left"
      className="mge-flow-canvas-controls"
      aria-label="Flowchart canvas controls"
    >
      <div className="mge-curve-control-row">
        <select
          className="react-flow__controls-button mge-curve-select"
          aria-label="Edge curve"
          value={curve}
          onChange={(e) => setCurve(e.target.value as FlowchartCurve)}
        >
          <option value="basis">Curve: Basis</option>
          <option value="linear">Curve: Linear</option>
          <option value="step">Curve: Step</option>
          <option value="natural">Curve: Natural</option>
        </select>
        <span
          className="mge-curve-caveat"
          aria-label="Saved correctly either way, but a known upstream Mermaid bug means some Mermaid versions render every curve the same regardless of this setting."
        >
          ⓘ
        </span>
      </div>
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
