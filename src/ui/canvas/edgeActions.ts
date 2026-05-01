import type { IREdge } from "../../core/ir-types";
import type { Selection } from "../../core/store-factory";

export const findEdgeForHandleUpdate = (
  edges: IREdge[],
  selection: Selection,
  source: string,
  target: string,
): IREdge | null => {
  const matchingEdges = edges.filter((edge) => edge.source === source && edge.target === target);
  const selectedMatch = matchingEdges.find((edge) => selection.edgeIds.includes(edge.id));
  return selectedMatch ?? (matchingEdges.length === 1 ? matchingEdges[0] : null);
};
