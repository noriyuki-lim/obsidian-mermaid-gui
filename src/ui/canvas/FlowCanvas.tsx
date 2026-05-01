import { useCallback, useMemo, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEditorStore, useEditorStoreApi } from "../EditorContext";
import { ShapeNode } from "./ShapeNode";
import { SubgraphNode } from "./SubgraphNode";
import type { NodeShape } from "../../core/ir-types";
import { irToFlow, isSubgraphFlowId, type FlowEdge, type FlowNode } from "../adapter";

const nodeTypes = { shape: ShapeNode, subgraph: SubgraphNode };

export const FlowCanvas = () => {
  const ir = useEditorStore((s) => s.ir);
  const setNodePositions = useEditorStore((s) => s.setNodePositions);
  const removeSelection = useEditorStore((s) => s.removeSelection);
  const addNode = useEditorStore((s) => s.addNode);
  const setNodePosition = useEditorStore((s) => s.setNodePosition);
  const addEdge = useEditorStore((s) => s.addEdge);
  const setSelection = useEditorStore((s) => s.setSelection);
  const storeApi = useEditorStoreApi();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const flowInstance = useRef<ReactFlowInstance<FlowNode, FlowEdge> | null>(null);

  const projection = useMemo(() => irToFlow(ir, ir.positions), [ir]);

  const decoratedEdges = useMemo<FlowEdge[]>(
    () =>
      projection.edges.map((e) => ({
        ...e,
        markerEnd:
          e.data?.head === "arrow"
            ? { type: MarkerType.ArrowClosed, color: "#444" }
            : undefined,
      })),
    [projection.edges],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      const positionChanges: Array<{ id: string; pos: { x: number; y: number } }> = [];
      const removalIds: string[] = [];
      const selectionUpdates: Array<{ id: string; selected: boolean }> = [];
      for (const c of changes) {
        if ("id" in c && isSubgraphFlowId(c.id)) continue;
        if (c.type === "position" && c.position && c.dragging === false) {
          positionChanges.push({ id: c.id, pos: c.position });
        } else if (c.type === "position" && c.position && c.dragging) {
          setNodePosition(c.id, c.position);
        } else if (c.type === "remove") {
          removalIds.push(c.id);
        } else if (c.type === "select") {
          selectionUpdates.push({ id: c.id, selected: c.selected });
        }
      }
      if (positionChanges.length > 0) setNodePositions(positionChanges, { recordHistory: true });
      if (removalIds.length > 0) {
        removeSelection({ nodeIds: removalIds, edgeIds: [] });
      }
      if (selectionUpdates.length > 0) {
        const cur = storeApi.getState().selection;
        const next = new Set(cur.nodeIds);
        for (const u of selectionUpdates) {
          if (u.selected) next.add(u.id);
          else next.delete(u.id);
        }
        setSelection({ nodeIds: [...next], edgeIds: cur.edgeIds });
      }
    },
    [setNodePositions, setNodePosition, removeSelection, setSelection, storeApi],
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
        removeSelection({ nodeIds: [], edgeIds: removed });
      }
      if (selectionUpdates.length > 0) {
        const cur = storeApi.getState().selection;
        const next = new Set(cur.edgeIds);
        for (const u of selectionUpdates) {
          if (u.selected) next.add(u.id);
          else next.delete(u.id);
        }
        setSelection({ nodeIds: cur.nodeIds, edgeIds: [...next] });
      }
    },
    [removeSelection, setSelection, storeApi],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (c.source && c.target) addEdge(c.source, c.target);
    },
    [addEdge],
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
        onConnect={onConnect}
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
