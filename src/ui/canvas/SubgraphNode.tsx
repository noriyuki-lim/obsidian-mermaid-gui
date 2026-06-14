import {
  Handle,
  NodeResizer,
  Position,
  type Node,
  type NodeProps,
  type OnResizeStart,
  type ResizeParams,
} from "@xyflow/react";
import type { SubgraphNodeData } from "../adapter";
import { useEditorStore } from "../EditorContext";

type SubgraphFlowNode = Node<SubgraphNodeData, "subgraph">;

const MIN_W = 200;
const MIN_H = 100;

/**
 * Subgraph backdrop. Carries 8 connection handles (T/B/L/R × source/target)
 * so edges can attach directly to the subgraph boundary, not just to the
 * nodes it contains. A `NodeResizer` (visible while selected) lets the user
 * drag any side/corner to resize the container; the new frame is persisted to
 * the store's `subgraphFrames` — session-only, like node positions, never
 * written back to Mermaid source. Inline `color` / `borderColor` from IR
 * override the theme defaults via CSS variables.
 */
export const SubgraphNode = ({ data, selected }: NodeProps<SubgraphFlowNode>) => {
  const resizeSubgraph = useEditorStore((s) => s.resizeSubgraph);
  const recordHistorySnapshot = useEditorStore((s) => s.recordHistorySnapshot);

  const style: React.CSSProperties = {};
  if (data.color) (style as Record<string, string>)["--mge-subgraph-bg"] = data.color;
  if (data.borderColor) (style as Record<string, string>)["--mge-subgraph-border"] = data.borderColor;

  // Snapshot once at gesture start so an entire resize drag is a single undo
  // step, mirroring the move-subgraph behaviour in FlowCanvas. Live updates
  // during the drag skip history; the frame is what we persist (session-only).
  const onResizeStart: OnResizeStart = () => {
    recordHistorySnapshot();
  };
  const applyFrame = (_evt: unknown, params: ResizeParams) => {
    resizeSubgraph(
      data.sgId,
      { x: params.x, y: params.y, width: params.width, height: params.height },
      { recordHistory: false },
    );
  };

  return (
    <div className={`mge-subgraph-node${selected ? " selected" : ""}`} style={style}>
      <NodeResizer
        isVisible={selected}
        minWidth={MIN_W}
        minHeight={MIN_H}
        onResizeStart={onResizeStart}
        onResize={applyFrame}
        onResizeEnd={applyFrame}
      />
      <div className="mge-subgraph-header" title="Drag to move subgraph">
        {data.label}
      </div>
      <Handle id="t-top" type="target" position={Position.Top} className="mge-sg-handle" />
      <Handle id="s-top" type="source" position={Position.Top} className="mge-sg-handle" />
      <Handle id="t-right" type="target" position={Position.Right} className="mge-sg-handle" />
      <Handle id="s-right" type="source" position={Position.Right} className="mge-sg-handle" />
      <Handle id="s-bottom" type="source" position={Position.Bottom} className="mge-sg-handle" />
      <Handle id="t-bottom" type="target" position={Position.Bottom} className="mge-sg-handle" />
      <Handle id="t-left" type="target" position={Position.Left} className="mge-sg-handle" />
      <Handle id="s-left" type="source" position={Position.Left} className="mge-sg-handle" />
    </div>
  );
};
