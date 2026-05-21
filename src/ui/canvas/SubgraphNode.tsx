import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { SubgraphNodeData } from "../adapter";

type SubgraphFlowNode = Node<SubgraphNodeData, "subgraph">;

/**
 * Subgraph backdrop. Carries 8 connection handles (T/B/L/R × source/target)
 * so edges can attach directly to the subgraph boundary, not just to the
 * nodes it contains. Inline `color` / `borderColor` from IR override the
 * theme defaults via CSS variables; this keeps the dashed-border look while
 * letting users tint individual containers.
 */
export const SubgraphNode = ({ data, selected }: NodeProps<SubgraphFlowNode>) => {
  const style: React.CSSProperties = {};
  if (data.color) (style as Record<string, string>)["--mge-subgraph-bg"] = data.color;
  if (data.borderColor) (style as Record<string, string>)["--mge-subgraph-border"] = data.borderColor;

  return (
    <div className={`mge-subgraph-node${selected ? " selected" : ""}`} style={style}>
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
