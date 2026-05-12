import type { Node, NodeProps } from "@xyflow/react";
import type { SubgraphNodeData } from "../adapter";

type SubgraphFlowNode = Node<SubgraphNodeData, "subgraph">;

export const SubgraphNode = ({ data, selected }: NodeProps<SubgraphFlowNode>) => (
  <div className={`mge-subgraph-node${selected ? " selected" : ""}`}>
    <div className="mge-subgraph-header" title="Drag to move subgraph">
      {data.label}
    </div>
  </div>
);
