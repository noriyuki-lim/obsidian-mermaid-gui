import { useCallback, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  ConnectionMode,
  type Connection,
  type EdgeChange,
  type HandleType,
  type NodeChange,
  type OnReconnect,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEditorStore, useEditorStoreApi } from "../EditorContext";
import { ShapeNode } from "./ShapeNode";
import { SubgraphNode } from "./SubgraphNode";
import type { NodeShape } from "../../core/ir-types";
import {
  irToFlow,
  isSubgraphFlowId,
  subgraphIdFromFlowId,
  type FlowEdge,
  type FlowNode,
} from "../adapter";
import type { EdgeHandleId } from "../../core/ir-types";
import {
  findEdgeForHandleUpdate,
  normalizeNewConnection,
  normalizeReconnect,
  type ConnectStart,
  type ReconnectMovingSide,
} from "./edgeActions";

const nodeTypes = { shape: ShapeNode, subgraph: SubgraphNode };

const edgeHandleOrUndefined = (handle: string | null | undefined): EdgeHandleId | undefined =>
  handle ? (handle as EdgeHandleId) : undefined;

export const FlowCanvas = () => {
  const ir = useEditorStore((s) => s.ir);
  const setNodePositions = useEditorStore((s) => s.setNodePositions);
  const removeSelection = useEditorStore((s) => s.removeSelection);
  const addNode = useEditorStore((s) => s.addNode);
  const setNodePosition = useEditorStore((s) => s.setNodePosition);
  const addEdge = useEditorStore((s) => s.addEdge);
  const updateEdge = useEditorStore((s) => s.updateEdge);
  const setSelection = useEditorStore((s) => s.setSelection);
  const moveSubgraph = useEditorStore((s) => s.moveSubgraph);
  const recordHistorySnapshot = useEditorStore((s) => s.recordHistorySnapshot);
  const storeApi = useEditorStoreApi();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const flowInstance = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);
  const connectStart = useRef<ConnectStart | null>(null);
  const reconnectMovingSide = useRef<ReconnectMovingSide | null>(null);

  const projection = useMemo(() => irToFlow(ir, ir.positions), [ir]);
  const subgraphFlowById = useMemo(
    () => new Map(projection.nodes.filter((n) => isSubgraphFlowId(n.id)).map((n) => [n.id, n])),
    [projection.nodes],
  );

  const decoratedEdges = useMemo<FlowEdge[]>(
    () =>
      projection.edges.map((e) => ({
        ...e,
        markerEnd:
          e.data?.head === "arrow"
            ? { type: MarkerType.ArrowClosed, color: "var(--mge-edge)" }
            : undefined,
      })),
    [projection.edges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const positionChanges: Array<{ id: string; pos: { x: number; y: number } }> = [];
      const removalIds: string[] = [];
      const subgraphRemovalIds: string[] = [];
      const selectionUpdates: Array<{ id: string; selected: boolean }> = [];
      const subgraphSelectionUpdates: Array<{ id: string; selected: boolean }> = [];
      const membershipUpdates: Array<{ id: string; subgraph: string | null }> = [];
      const subgraphAt = (pos: { x: number; y: number }): string | null => {
        const center = { x: pos.x + 80, y: pos.y + 30 };
        let best: { id: string; area: number } | null = null;
        for (const node of subgraphFlowById.values()) {
          const sgId = subgraphIdFromFlowId(node.id);
          if (!sgId) continue;
          const width = typeof node.style?.width === "number" ? node.style.width : 200;
          const height = typeof node.style?.height === "number" ? node.style.height : 100;
          const inside =
            center.x >= node.position.x &&
            center.x <= node.position.x + width &&
            center.y >= node.position.y &&
            center.y <= node.position.y + height;
          if (!inside) continue;
          const area = width * height;
          if (!best || area < best.area) best = { id: sgId, area };
        }
        return best?.id ?? null;
      };
      for (const c of changes) {
        const changeId = "id" in c ? c.id : null;
        const subgraphId = changeId ? subgraphIdFromFlowId(changeId) : null;
        if (subgraphId) {
          if (c.type === "position" && c.position) {
            const current = subgraphFlowById.get(c.id);
            if (!current) continue;
            const width = typeof current.style?.width === "number" ? current.style.width : 200;
            const height = typeof current.style?.height === "number" ? current.style.height : 100;
            const delta = {
              x: c.position.x - current.position.x,
              y: c.position.y - current.position.y,
            };
            if (delta.x !== 0 || delta.y !== 0) {
              moveSubgraph(
                subgraphId,
                delta,
                { x: c.position.x, y: c.position.y, width, height },
                { recordHistory: false },
              );
            }
          } else if (c.type === "remove") {
            subgraphRemovalIds.push(subgraphId);
          } else if (c.type === "select") {
            subgraphSelectionUpdates.push({ id: subgraphId, selected: c.selected });
          }
          continue;
        }
        if (c.type === "position" && c.position && c.dragging === false) {
          positionChanges.push({ id: c.id, pos: c.position });
          const nextSubgraph = subgraphAt(c.position);
          const currentSubgraph =
            storeApi.getState().ir.nodes.find((node) => node.id === c.id)?.subgraph ?? null;
          if (nextSubgraph !== currentSubgraph) {
            membershipUpdates.push({ id: c.id, subgraph: nextSubgraph });
          }
        } else if (c.type === "position" && c.position && c.dragging) {
          setNodePosition(c.id, c.position);
        } else if (c.type === "remove") {
          removalIds.push(c.id);
        } else if (c.type === "select") {
          selectionUpdates.push({ id: c.id, selected: c.selected });
        }
      }
      if (positionChanges.length > 0) {
        setNodePositions(positionChanges, {
          recordHistory: true,
          subgraphs: membershipUpdates,
        });
      }
      if (removalIds.length > 0) {
        removeSelection({ nodeIds: removalIds, edgeIds: [], subgraphIds: [] });
      }
      if (subgraphRemovalIds.length > 0) {
        removeSelection({ nodeIds: [], edgeIds: [], subgraphIds: subgraphRemovalIds });
      }
      if (selectionUpdates.length > 0 || subgraphSelectionUpdates.length > 0) {
        const cur = storeApi.getState().selection;
        const next = new Set(cur.nodeIds);
        const nextSubgraphs = new Set(cur.subgraphIds);
        for (const u of selectionUpdates) {
          if (u.selected) next.add(u.id);
          else next.delete(u.id);
        }
        for (const u of subgraphSelectionUpdates) {
          if (u.selected) nextSubgraphs.add(u.id);
          else nextSubgraphs.delete(u.id);
        }
        setSelection({ nodeIds: [...next], edgeIds: cur.edgeIds, subgraphIds: [...nextSubgraphs] });
      }
    },
    [
      setNodePositions,
      setNodePosition,
      moveSubgraph,
      removeSelection,
      setSelection,
      storeApi,
      subgraphFlowById,
    ],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      const removed: string[] = [];
      const selectionUpdates: Array<{ id: string; selected: boolean }> = [];
      for (const c of changes) {
        if (c.type === "remove") removed.push(c.id);
        if (c.type === "select") selectionUpdates.push({ id: c.id, selected: c.selected });
      }
      if (removed.length > 0) {
        removeSelection({ nodeIds: [], edgeIds: removed, subgraphIds: [] });
      }
      if (selectionUpdates.length > 0) {
        const cur = storeApi.getState().selection;
        const next = new Set(cur.edgeIds);
        for (const u of selectionUpdates) {
          if (u.selected) next.add(u.id);
          else next.delete(u.id);
        }
        setSelection({ nodeIds: cur.nodeIds, edgeIds: [...next], subgraphIds: cur.subgraphIds });
      }
    },
    [removeSelection, setSelection, storeApi],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      const normalized = normalizeNewConnection(c, connectStart.current);
      connectStart.current = null;
      if (!normalized) return;
      const state = storeApi.getState();
      const edgeToUpdate = findEdgeForHandleUpdate(
        state.ir.edges,
        state.selection,
        normalized.source,
        normalized.target,
      );
      if (edgeToUpdate) {
        updateEdge(edgeToUpdate.id, normalized);
        return;
      }
      addEdge(normalized.source, normalized.target, {
        sourceHandle: edgeHandleOrUndefined(normalized.sourceHandle),
        targetHandle: edgeHandleOrUndefined(normalized.targetHandle),
      });
    },
    [addEdge, storeApi, updateEdge],
  );

  const focusLabelEditor = useCallback(() => {
    window.dispatchEvent(new CustomEvent("mge:focus-label-editor"));
  }, []);

  const onReconnect = useCallback<OnReconnect<FlowEdge>>(
    (oldEdge, c) => {
      const irEdge = storeApi.getState().ir.edges.find((edge) => edge.id === oldEdge.id);
      if (!irEdge) return;
      const normalized = normalizeReconnect(irEdge, c, reconnectMovingSide.current);
      reconnectMovingSide.current = null;
      if (!normalized) return;
      updateEdge(oldEdge.id, normalized);
    },
    [storeApi, updateEdge],
  );

  const onReconnectStart = useCallback(
    (_: ReactMouseEvent<Element>, edge: FlowEdge, fixedSide: HandleType) => {
      setSelection({ nodeIds: [], edgeIds: [edge.id], subgraphIds: [] });
      reconnectMovingSide.current = fixedSide === "target" ? "source" : "target";
    },
    [setSelection],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const shape = e.dataTransfer.getData("application/x-mermaid-shape") as NodeShape;
      if (!shape || !flowInstance.current) return;
      const pos = flowInstance.current.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      const id = addNode(shape);
      setNodePosition(id, { x: pos.x - 80, y: pos.y - 30 });
    },
    [addNode, setNodePosition],
  );

  return (
    <div className="mge-canvas" ref={wrapperRef} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow<FlowNode, FlowEdge>
        nodes={projection.nodes}
        edges={decoratedEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnectStart={(_, params) => {
          connectStart.current = params.nodeId
            ? {
                nodeId: params.nodeId,
                handleId: params.handleId,
                handleType: params.handleType,
              }
            : null;
        }}
        onConnectEnd={() => {
          connectStart.current = null;
        }}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={() => {
          reconnectMovingSide.current = null;
        }}
        onNodeDoubleClick={(_, node) => {
          if (!isSubgraphFlowId(node.id)) {
            setSelection({ nodeIds: [node.id], edgeIds: [], subgraphIds: [] });
            focusLabelEditor();
          } else {
            const subgraphId = subgraphIdFromFlowId(node.id);
            if (!subgraphId) return;
            setSelection({ nodeIds: [], edgeIds: [], subgraphIds: [subgraphId] });
            focusLabelEditor();
          }
        }}
        onNodeClick={(_, node) => {
          if (!isSubgraphFlowId(node.id)) {
            setSelection({ nodeIds: [node.id], edgeIds: [], subgraphIds: [] });
          } else {
            const subgraphId = subgraphIdFromFlowId(node.id);
            if (!subgraphId) return;
            setSelection({ nodeIds: [], edgeIds: [], subgraphIds: [subgraphId] });
          }
        }}
        onNodeDragStart={(_, node) => {
          if (isSubgraphFlowId(node.id)) recordHistorySnapshot();
        }}
        onEdgeDoubleClick={(_, edge) => {
          setSelection({ nodeIds: [], edgeIds: [edge.id], subgraphIds: [] });
          focusLabelEditor();
        }}
        onEdgeClick={(_, edge) => {
          setSelection({ nodeIds: [], edgeIds: [edge.id], subgraphIds: [] });
        }}
        edgesReconnectable
        connectionMode={ConnectionMode.Loose}
        onInit={(inst) => {
          flowInstance.current = inst;
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        snapToGrid
        snapGrid={[10, 10]}
        deleteKeyCode={["Backspace", "Delete"]}
      >
        <Background gap={16} />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </div>
  );
};
