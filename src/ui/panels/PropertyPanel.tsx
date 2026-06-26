import { useEffect, useRef, useState } from "react";
import { PALETTE_SHAPES, SHAPE_BY_KEY } from "../../core/shapes";
import type { Direction, EdgeHead, EdgeStyle, NodeShape } from "../../core/ir-types";
import { useEditorStore } from "../EditorContext";

export const PropertyPanel = () => {
  const ir = useEditorStore((s) => s.ir);
  const selection = useEditorStore((s) => s.selection);
  const updateNode = useEditorStore((s) => s.updateNode);
  const updateEdge = useEditorStore((s) => s.updateEdge);
  const updateSubgraph = useEditorStore((s) => s.updateSubgraph);
  const removeSelection = useEditorStore((s) => s.removeSelection);
  const recordHistorySnapshot = useEditorStore((s) => s.recordHistorySnapshot);

  const node =
    selection.nodeIds.length === 1 ? ir.nodes.find((n) => n.id === selection.nodeIds[0]) : null;
  const edge =
    selection.edgeIds.length === 1 ? ir.edges.find((e) => e.id === selection.edgeIds[0]) : null;
  const subgraph =
    selection.subgraphIds.length === 1
      ? ir.subgraphs.find((s) => s.id === selection.subgraphIds[0])
      : null;

  /* Local mirror of label inputs so each keystroke does not produce a history
     entry. We commit to history once on blur. */
  const [nodeLabel, setNodeLabel] = useState<string>(node?.label ?? "");
  const [edgeLabel, setEdgeLabel] = useState<string>(edge?.label ?? "");
  const [subgraphLabel, setSubgraphLabel] = useState<string>(subgraph?.label ?? subgraph?.id ?? "");
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

  useEffect(() => {
    setSubgraphLabel(subgraph?.label ?? subgraph?.id ?? "");
  }, [subgraph?.id, subgraph?.label]);

  if (!node && !edge && !subgraph) {
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
        <div className="mge-prop-field mge-prop-color-row">
          <label>Fill</label>
          <input
            type="color"
            value={node.color ?? "#ffffff"}
            onChange={(e) => updateNode(node.id, { color: e.target.value }, { recordHistory: false })}
            onBlur={() => recordHistorySnapshot()}
          />
          {node.color && (
            <button
              type="button"
              className="mge-link-btn"
              onClick={() => updateNode(node.id, { color: undefined })}
            >
              clear
            </button>
          )}
        </div>
        <div className="mge-prop-field mge-prop-color-row">
          <label>Border</label>
          <input
            type="color"
            value={node.borderColor ?? "#000000"}
            onChange={(e) => updateNode(node.id, { borderColor: e.target.value }, { recordHistory: false })}
            onBlur={() => recordHistorySnapshot()}
          />
          {node.borderColor && (
            <button
              type="button"
              className="mge-link-btn"
              onClick={() => updateNode(node.id, { borderColor: undefined })}
            >
              clear
            </button>
          )}
        </div>
        <button
          className="mge-danger-btn"
          type="button"
          onClick={() => removeSelection({ nodeIds: [node.id], edgeIds: [], subgraphIds: [] })}
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
          onClick={() => removeSelection({ nodeIds: [], edgeIds: [edge.id], subgraphIds: [] })}
        >
          Delete edge
        </button>
      </aside>
    );
  }

  if (subgraph) {
    // Block ancestors of `subgraph` from appearing in the parent dropdown to
    // keep the nesting acyclic. Otherwise users could create a parent loop
    // that the IR can express but the layout cannot satisfy.
    const isDescendantOf = (candidateId: string, ancestorId: string): boolean => {
      let cur: string | null | undefined = candidateId;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        if (cur === ancestorId) return true;
        seen.add(cur);
        cur = ir.subgraphs.find((s) => s.id === cur)?.parent ?? null;
      }
      return false;
    };
    const parentOptions = ir.subgraphs.filter(
      (s) => s.id !== subgraph.id && !isDescendantOf(s.id, subgraph.id),
    );
    return (
      <aside className="mge-prop-panel">
        <h3>Subgraph — {subgraph.id}</h3>
        <div className="mge-prop-field">
          <label>Label</label>
          <input
            ref={labelInputRef}
            value={subgraphLabel}
            onChange={(e) => {
              const v = e.target.value;
              setSubgraphLabel(v);
              updateSubgraph(subgraph.id, { label: v || undefined }, { recordHistory: false });
            }}
            onBlur={() => recordHistorySnapshot()}
          />
        </div>
        <div className="mge-prop-field">
          <label>Parent</label>
          <select
            value={subgraph.parent ?? ""}
            onChange={(e) =>
              updateSubgraph(subgraph.id, { parent: e.target.value === "" ? null : e.target.value })
            }
          >
            <option value="">(none — top level)</option>
            {parentOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label ?? s.id}
              </option>
            ))}
          </select>
        </div>
        <div className="mge-prop-field">
          <label>Direction</label>
          <select
            value={subgraph.direction ?? ""}
            onChange={(e) =>
              updateSubgraph(subgraph.id, {
                direction: e.target.value === "" ? undefined : (e.target.value as Direction),
              })
            }
          >
            <option value="">(inherit)</option>
            <option value="TD">Top-Down</option>
            <option value="LR">Left-Right</option>
            <option value="BT">Bottom-Top</option>
            <option value="RL">Right-Left</option>
          </select>
        </div>
        <div className="mge-prop-field mge-prop-color-row">
          <label>Fill</label>
          <input
            type="color"
            value={subgraph.color ?? "#ffffff"}
            onChange={(e) =>
              updateSubgraph(subgraph.id, { color: e.target.value }, { recordHistory: false })
            }
            onBlur={() => recordHistorySnapshot()}
          />
          {subgraph.color && (
            <button
              type="button"
              className="mge-link-btn"
              onClick={() => updateSubgraph(subgraph.id, { color: undefined })}
            >
              clear
            </button>
          )}
        </div>
        <div className="mge-prop-field mge-prop-color-row">
          <label>Border</label>
          <input
            type="color"
            value={subgraph.borderColor ?? "#000000"}
            onChange={(e) =>
              updateSubgraph(subgraph.id, { borderColor: e.target.value }, { recordHistory: false })
            }
            onBlur={() => recordHistorySnapshot()}
          />
          {subgraph.borderColor && (
            <button
              type="button"
              className="mge-link-btn"
              onClick={() => updateSubgraph(subgraph.id, { borderColor: undefined })}
            >
              clear
            </button>
          )}
        </div>
        <button
          className="mge-danger-btn"
          type="button"
          onClick={() => removeSelection({ nodeIds: [], edgeIds: [], subgraphIds: [subgraph.id] })}
        >
          Remove subgraph
        </button>
      </aside>
    );
  }
  return null;
};
