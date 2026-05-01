import type { Connection, HandleType } from "@xyflow/react";
import type { EdgeHandleId, IREdge } from "../../core/ir-types";
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

export interface ConnectStart {
  nodeId: string;
  handleId?: string | null;
  handleType?: HandleType | null;
}

export type EdgeEndpointPatch = Pick<IREdge, "source" | "target"> &
  Pick<Partial<IREdge>, "sourceHandle" | "targetHandle">;

export type ReconnectMovingSide = "source" | "target";

const sideFromHandle = (handle: string | null | undefined): string | null => {
  const match = /^(?:s|t)-(top|right|bottom|left)$/.exec(handle ?? "");
  return match?.[1] ?? null;
};

const toSourceHandle = (handle: string | null | undefined): EdgeHandleId | undefined => {
  const side = sideFromHandle(handle);
  return side ? (`s-${side}` as EdgeHandleId) : undefined;
};

const toTargetHandle = (handle: string | null | undefined): EdgeHandleId | undefined => {
  const side = sideFromHandle(handle);
  return side ? (`t-${side}` as EdgeHandleId) : undefined;
};

export const normalizeNewConnection = (
  connection: Connection,
  start: ConnectStart | null,
): EdgeEndpointPatch | null => {
  if (!connection.source || !connection.target) return null;

  if (start?.handleType === "target" && connection.target === start.nodeId) {
    return {
      source: start.nodeId,
      target: connection.source,
      sourceHandle: toSourceHandle(start.handleId),
      targetHandle: toTargetHandle(connection.sourceHandle),
    };
  }

  return {
    source: connection.source,
    target: connection.target,
    sourceHandle: toSourceHandle(connection.sourceHandle),
    targetHandle: toTargetHandle(connection.targetHandle),
  };
};

export const normalizeReconnect = (
  oldEdge: IREdge,
  connection: Connection,
  movingSide: ReconnectMovingSide | null,
): Partial<IREdge> | null => {
  if (!connection.source || !connection.target || !movingSide) return null;

  if (movingSide === "source") {
    const source = connection.source;
    if (source === oldEdge.target && oldEdge.source !== oldEdge.target) {
      return {
        source: oldEdge.source,
        target: oldEdge.target,
        sourceHandle: oldEdge.sourceHandle,
        targetHandle: toTargetHandle(connection.sourceHandle),
      };
    }
    return {
      source,
      target: oldEdge.target,
      sourceHandle: toSourceHandle(connection.sourceHandle),
      targetHandle: oldEdge.targetHandle,
    };
  }

  const target = connection.target;
  if (target === oldEdge.source && oldEdge.source !== oldEdge.target) {
    return {
      source: oldEdge.source,
      target: oldEdge.target,
      sourceHandle: toSourceHandle(connection.targetHandle),
      targetHandle: oldEdge.targetHandle,
    };
  }
  return {
    source: oldEdge.source,
    target,
    sourceHandle: oldEdge.sourceHandle,
    targetHandle: toTargetHandle(connection.targetHandle),
  };
};
