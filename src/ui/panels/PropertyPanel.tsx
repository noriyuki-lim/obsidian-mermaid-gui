import { useEffect, useRef, useState } from "react";
import { PALETTE_SHAPES, SHAPE_BY_KEY } from "../../core/shapes";
import type { EdgeHead, EdgeStyle, NodeShape } from "../../core/ir-types";
import { useEditorStore } from "../EditorContext";

export const PropertyPanel = () => {
  const ir = useEditorStore((s) => s.ir);
  const selection = useEditorStore((s) => s.selection);
  const updateNode = useEditorStore((s) => s.updateNode);
  const updateEdge = useEditorStore((s) => s.updateEdge);
  const removeSelection = useEditorStore((s) => s.removeSelection);
  const recordHistorySnapshot = useEditorStore((s) => s.recordHistorySnapshot);

  const node =
    selection.nodeIds.length === 1 ? ir.nodes.find((n) => n.id === selection.nodeIds[0]) : null;
  const edge =
    selection.edgeIds.length === 1 ? ir.edges.find((e) => e.id === selection.edgeIds[0]) : null;

  /* Local mirror of label inputs so each keystroke does not produce a history
     entry. We commit to history once on blur. */
  const [nodeLabel, setNodeLabel] = useState<string>(node?.label ?? "");
  const [edgeLabel, setEdgeLabel] = useState<string>(edge?.label ?? "");
  const labelInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onFocusLabel = () => {
      window.setTimeout(() => {
        labelInputRef.current?.focus();
        labelInputRef.current?.select();
      }, 0);
    };
    window.addEventListener("mge:focus-label-editor", onFocusLabel);
    return () => window.removeEventListener("mge:focus-label-editor", onFocusLabel);
  }, []);

  useEffect(() => {
    setNodeLabel(node?.label ?? "");
  }, [node?.id, node?.label]);

  useEffect(() => {
    setEdgeLabel(edge?.label ?? "");
  }, [edge?.id, edge?.label]);

  if (!node && !edge) {
    return (
      <aside className="mge-prop-panel">
        <h3>Properties</h3>
        <p className="mge-empty">Select a node or edge to edit its properties.</p>
      </aside>
    );
  }

  if (node) {
    return (
      <aside className="mge-prop-panel">
        <h3>Node — {node.id}</h3>
        <div className="mge-prop-field">
          <label>Label</label>
          <input
            ref={labelInputRef}
            value={nodeLabel}
            onChange={(e) => {
              const v = e.target.value;
              setNodeLabel(v);
              updateNode(node.id, { label: v }, { recordHistory: false });
            }}
            onBlur={() => recordHistorySnapshot()}
          />
        </div>
        <div className="mge-prop-field">
          <label>Shape</label>
          <select
            value={node.shape}
            onChange={(e) => updateNode(node.id, { shape: e.target.value as NodeShape })}
          >
            {PALETTE_SHAPES.map((s) => (
              <option key={s} value={s}>
                {SHAPE_BY_KEY[s].display}
              </option>
            ))}
          </select>
        </div>
        <div className="mge-prop-field">
          <label>Subgraph</label>
          <select
            value={node.subgraph ?? ""}
            onChange={(e) =>
              updateNode(node.id, { subgraph: e.target.value === "" ? null : e.target.value })
            }
          >
            <option value="">(none)</option>
            {ir.subgraphs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label ?? s.id}
              </option>
            ))}
          </select>
        </div>
        <button
          className="mge-danger-btn"
          type="button"
          onClick={() => removeSelection({ nodeIds: [node.id], edgeIds: [] })}
        >
          Delete node
        </button>
      </aside>
    );
  }

  if (edge) {
    return (
      <aside className="mge-prop-panel">
        <h3>Edge — {edge.source} → {edge.target}</h3>
        <div className="mge-prop-field">
          <label>Label</label>
          <input
            ref={labelInputRef}
            value={edgeLabel}
            onChange={(e) => {
              const v = e.target.value;
              setEdgeLabel(v);
              updateEdge(edge.id, { label: v || undefined }, { recordHistory: false });
            }}
            onBlur={() => recordHistorySnapshot()}
          />
        </div>
        <div className="mge-prop-field">
          <label>Style</label>
          <select
            value={edge.style}
            onChange={(e) => updateEdge(edge.id, { style: e.target.value as EdgeStyle })}
          >
            <option value="solid">Solid</option>
            <option value="dotted">Dotted</option>
            <option value="thick">Thick</option>
          </select>
        </div>
        <div className="mge-prop-field">
          <label>Arrow head</label>
          <select
            value={edge.head}
            onChange={(e) => updateEdge(edge.id, { head: e.target.value as EdgeHead })}
          >
            <option value="arrow">Arrow</option>
            <option value="none">None</option>
          </select>
        </div>
        <button
          className="mge-danger-btn"
          type="button"
          onClick={() => removeSelection({ nodeIds: [], edgeIds: [edge.id] })}
        >
          Delete edge
        </button>
      </aside>
    );
  }
  return null;
};
