import { useCallback, useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";
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
import { FlowchartCanvasControls } from "./FlowchartCanvasControls";
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
  resolveReconnectEdgeId,
  type ConnectStart,
  type ReconnectMovingSide,
} from "./edgeActions";

const nodeTypes = { shape: ShapeNode, subgraph: SubgraphNode };

const edgeHandleOrUndefined = (handle: string | null | undefined): EdgeHandleId | undefined =>
  handle ? (handle as EdgeHandleId) : undefined;

export const FlowCanvas = () => {
  const ir = useEditorStore((s) => s.ir);
  const selection = useEditorStore((s) => s.selection);
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
  const canvasSize = useRef<{ width: number; height: number } | null>(null);
  const pendingResizeCenter = useRef<{ x: number; y: number; zoom: number } | null>(null);
  const connectStart = useRef<ConnectStart | null>(null);
  const reconnectMovingSide = useRef<ReconnectMovingSide | null>(null);
  const reconnectEdgeId = useRef<string | null>(null);

  const projection = useMemo(() => irToFlow(ir, ir.positions), [ir]);
  const subgraphFlowById = useMemo(
    () => new Map(projection.nodes.filter((n) => isSubgraphFlowId(n.id)).map((n) => [n.id, n])),
    [projection.nodes],
  );

  const selectedNodes = useMemo<FlowNode[]>(() => {
    const nodeIds = new Set(selection.nodeIds);
    const subgraphIds = new Set(selection.subgraphIds);
    return projection.nodes.map((node) => {
      const subgraphId = subgraphIdFromFlowId(node.id);
      const selected = subgraphId ? subgraphIds.has(subgraphId) : nodeIds.has(node.id);
      return node.selected === selected ? node : { ...node, selected };
    });
  }, [projection.nodes, selection.nodeIds, selection.subgraphIds]);

  const decoratedEdges = useMemo<FlowEdge[]>(
    () => {
      const edgeIds = new Set(selection.edgeIds);
      return projection.edges.map((e) => {
        const selected = edgeIds.has(e.id);
        return {
          ...e,
          selected,
          markerEnd:
            e.data?.head === "arrow"
              ? {
                  type: MarkerType.ArrowClosed,
                  color: selected ? "var(--mge-selection)" : "var(--mge-edge)",
                }
              : undefined,
        };
      });
    },
    [projection.edges, selection.edgeIds],
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
      // While a subgraph is being resized, React Flow emits the box's new x/y as
      // a position change alongside the dimensions change. The NodeResizer
      // callbacks (SubgraphNode) already persist the full frame, so we must NOT
      // also treat that x/y as a move — moveSubgraph would drag the contained
      // nodes. Collect the in-flight resize ids and skip their position changes.
      const resizingSubgraphIds = new Set<string>();
      for (const c of changes) {
        if (
          c.type === "dimensions" &&
          (c as { resizing?: boolean }).resizing &&
          "id" in c
        ) {
          const sgId = subgraphIdFromFlowId(c.id);
          if (sgId) resizingSubgraphIds.add(sgId);
        }
      }
      for (const c of changes) {
        const changeId = "id" in c ? c.id : null;
        const subgraphId = changeId ? subgraphIdFromFlowId(changeId) : null;
        if (subgraphId) {
          if (resizingSubgraphIds.has(subgraphId)) continue;
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
      // Flow ids for subgraph backdrops carry a `:sg:` prefix; the IR layer
      // stores the bare subgraph id (same identifier as in Mermaid source).
      const sourceBare = subgraphIdFromFlowId(normalized.source) ?? normalized.source;
      const targetBare = subgraphIdFromFlowId(normalized.target) ?? normalized.target;
      const state = storeApi.getState();
      const edgeToUpdate = findEdgeForHandleUpdate(
        state.ir.edges,
        state.selection,
        sourceBare,
        targetBare,
      );
      if (edgeToUpdate) {
        updateEdge(edgeToUpdate.id, {
          ...normalized,
          source: sourceBare,
          target: targetBare,
        });
        return;
      }
      addEdge(sourceBare, targetBare, {
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
      const edgeId = reconnectEdgeId.current ?? oldEdge.id;
      const irEdge = storeApi.getState().ir.edges.find((edge) => edge.id === edgeId);
      const movingSide = reconnectMovingSide.current;
      reconnectMovingSide.current = null;
      reconnectEdgeId.current = null;
      if (!irEdge) return;
      const normalized = normalizeReconnect(irEdge, c, movingSide);
      if (!normalized) return;
      // Strip subgraph flow-id prefix when persisting endpoints to the IR.
      const patch = {
        ...normalized,
        source: normalized.source ? (subgraphIdFromFlowId(normalized.source) ?? normalized.source) : normalized.source,
        target: normalized.target ? (subgraphIdFromFlowId(normalized.target) ?? normalized.target) : normalized.target,
      };
      updateEdge(edgeId, patch);
    },
    [storeApi, updateEdge],
  );

  const onReconnectStart = useCallback(
    (_: ReactMouseEvent<Element>, edge: FlowEdge, fixedSide: HandleType) => {
      const state = storeApi.getState();
      const edgeId = resolveReconnectEdgeId(state.ir.edges, state.selection, edge.id, fixedSide);
      reconnectEdgeId.current = edgeId;
      setSelection({ nodeIds: [], edgeIds: [edgeId], subgraphIds: [] });
      reconnectMovingSide.current = fixedSide === "target" ? "source" : "target";
    },
    [setSelection, storeApi],
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

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const modal = wrapper.closest(".mge-modal");

    const updateSize = (opts?: { force?: boolean }) => {
      const rect = wrapper.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const prev = canvasSize.current;
      const instance = flowInstance.current;
      if (!prev || !instance) {
        canvasSize.current = { width: rect.width, height: rect.height };
        return;
      }

      const isAnimating = modal?.classList.contains("mge-modal-animating");
      const viewport = instance.getViewport();
      if (isAnimating && !opts?.force) {
        const center =
          pendingResizeCenter.current ??
          {
            x: (prev.width / 2 - viewport.x) / viewport.zoom,
            y: (prev.height / 2 - viewport.y) / viewport.zoom,
            zoom: viewport.zoom,
          };
        pendingResizeCenter.current = center;
        canvasSize.current = { width: rect.width, height: rect.height };
        void instance.setViewport({
          x: rect.width / 2 - center.x * center.zoom,
          y: rect.height / 2 - center.y * center.zoom,
          zoom: center.zoom,
        });
        return;
      }

      const center = pendingResizeCenter.current ?? {
        x: (prev.width / 2 - viewport.x) / viewport.zoom,
        y: (prev.height / 2 - viewport.y) / viewport.zoom,
        zoom: viewport.zoom,
      };
      pendingResizeCenter.current = null;
      canvasSize.current = { width: rect.width, height: rect.height };
      void instance.setViewport({
        x: rect.width / 2 - center.x * center.zoom,
        y: rect.height / 2 - center.y * center.zoom,
        zoom: center.zoom,
      });
    };

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(() => updateSize());
    });
    let transitionSettleTimer: number | null = null;
    const onModalTransitionEnd = () => {
      if (transitionSettleTimer !== null) window.clearTimeout(transitionSettleTimer);
      transitionSettleTimer = window.setTimeout(() => {
        transitionSettleTimer = null;
        updateSize({ force: true });
      }, 0);
    };
    observer.observe(wrapper);
    modal?.addEventListener("transitionend", onModalTransitionEnd);
    updateSize();
    return () => {
      observer.disconnect();
      if (transitionSettleTimer !== null) window.clearTimeout(transitionSettleTimer);
      modal?.removeEventListener("transitionend", onModalTransitionEnd);
    };
  }, []);

  return (
    <div className="mge-canvas" ref={wrapperRef} onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow<FlowNode, FlowEdge>
        nodes={selectedNodes}
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
          reconnectEdgeId.current = null;
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
        elevateEdgesOnSelect
        connectionMode={ConnectionMode.Loose}
        onInit={(inst) => {
          flowInstance.current = inst;
        }}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        snapToGrid
        snapGrid={[10, 10]}
        deleteKeyCode={null}
      >
        <FlowchartCanvasControls />
        <Background gap={16} />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </div>
  );
};
