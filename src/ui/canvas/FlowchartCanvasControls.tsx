import { Panel } from "@xyflow/react";
import type { Direction } from "../../core/ir-types";
import { useEditorStore } from "../EditorContext";

export const FlowchartCanvasControls = () => {
  const direction = useEditorStore((s) => s.ir.direction);
  const setDirection = useEditorStore((s) => s.setDirection);
  const addSubgraph = useEditorStore((s) => s.addSubgraph);
  const autoLayout = useEditorStore((s) => s.autoLayout);

  return (
    <Panel
      position="top-left"
      className="mge-flow-canvas-controls"
      aria-label="Flowchart canvas controls"
    >
      <label htmlFor="mge-flow-dir">Direction</label>
      <select
        id="mge-flow-dir"
        value={direction}
        onChange={(e) => setDirection(e.target.value as Direction)}
      >
        <option value="TD">Top-Down</option>
        <option value="LR">Left-Right</option>
        <option value="BT">Bottom-Top</option>
        <option value="RL">Right-Left</option>
      </select>
      <button type="button" onClick={() => addSubgraph()} title="Wrap selected nodes in a new subgraph">
        Subgraph
      </button>
      <button type="button" onClick={autoLayout} title="Auto-layout via Dagre">
        Auto-layout
      </button>
    </Panel>
  );
};
