import type { Node, NodeProps } from "@xyflow/react";
import type { SubgraphNodeData } from "../adapter";

type SubgraphFlowNode = Node<SubgraphNodeData, "subgraph">;

export const SubgraphNode = ({ data }: NodeProps<SubgraphFlowNode>) => (
  <div className="mge-subgraph-node">
    <div className="mge-subgraph-header">{data.label}</div>
  </div>
);
