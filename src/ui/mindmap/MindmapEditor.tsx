import { useCallback, useMemo, useState } from "react";
import { parseMindmap } from "../../core/mindmap/parser";
import { generateMindmap } from "../../core/mindmap/generator";
import { EditorShell, type SourceEditOutcome } from "../EditorShell";
import type { MindmapIR, MindmapNode, MindmapNodeShape } from "../../core/mindmap/ir-types";

interface Props {
  initialSource: string;
  onSave: (newSource: string) => void | Promise<void>;
  onCancel: () => void;
  renderMermaid?: (source: string) => Promise<string>;
}

const SHAPES: MindmapNodeShape[] = [
  "default", "square", "rounded", "circle", "hexagon", "cloud", "bang",
];

const SHAPE_LABEL: Record<MindmapNodeShape, string> = {
  default: "text",
  square: "[text]",
  rounded: "(text)",
  circle: "((text))",
  hexagon: "{{text}}",
  cloud: ")text(",
  bang: "))text((",
};

function seed(source: string): MindmapIR {
  const out = parseMindmap(source);
  if (out.ok) return out.ir;
  return {
    kind: "mindmap",
    root: { text: "Root", shape: "default", children: [] },
  };
}

// Deep clone helper
function cloneNode(n: MindmapNode): MindmapNode {
  return { ...n, children: n.children.map(cloneNode) };
}

// Path-based node accessor/mutator
type Path = number[];

function getNode(root: MindmapNode, path: Path): MindmapNode | null {
  let node = root;
  for (const idx of path) {
    if (!node.children[idx]) return null;
    node = node.children[idx];
  }
  return node;
}

function updateNode(root: MindmapNode, path: Path, updated: MindmapNode): MindmapNode {
  if (path.length === 0) return updated;
  const clone = cloneNode(root);
  let cur = clone;
  for (let i = 0; i < path.length - 1; i++) {
    cur = cur.children[path[i]];
  }
  cur.children[path[path.length - 1]] = updated;
  return clone;
}

function deleteNode(root: MindmapNode, path: Path): MindmapNode {
  const clone = cloneNode(root);
  let cur = clone;
  for (let i = 0; i < path.length - 1; i++) {
    cur = cur.children[path[i]];
  }
  cur.children.splice(path[path.length - 1], 1);
  return clone;
}

function addChild(root: MindmapNode, path: Path): MindmapNode {
  const clone = cloneNode(root);
  let cur = clone;
  for (const idx of path) {
    cur = cur.children[idx];
  }
  cur.children.push({ text: "New node", shape: "default", children: [] });
  return clone;
}

interface NodeEditorProps {
  node: MindmapNode;
  path: Path;
  isRoot: boolean;
  onUpdate: (path: Path, node: MindmapNode) => void;
  onDelete: (path: Path) => void;
  onAddChild: (path: Path) => void;
}

const NodeRow = ({ node, path, isRoot, onUpdate, onDelete, onAddChild }: NodeEditorProps) => {
  const [editing, setEditing] = useState(false);
  const depth = path.length;

  return (
    <div className="mge-mm-node-block" style={{ marginLeft: depth * 16 }}>
      <div className="mge-seq-row mge-mm-node-row">
        <span className="mge-mm-depth-indicator" style={{ color: "var(--text-muted)", fontSize: "0.75em", minWidth: "20px" }}>
          {"  ".repeat(depth)}
        </span>
        {editing ? (
          <>
            <input
              className="mge-seq-input"
              value={node.text}
              autoFocus
              onChange={(e) => onUpdate(path, { ...node, text: e.target.value })}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") setEditing(false); }}
              style={{ width: "140px" }}
            />
            <select
              className="mge-seq-select"
              value={node.shape}
              onChange={(e) => onUpdate(path, { ...node, shape: e.target.value as MindmapNodeShape })}
            >
              {SHAPES.map((s) => (
                <option key={s} value={s}>{SHAPE_LABEL[s]}</option>
              ))}
            </select>
          </>
        ) : (
          <span
            className="mge-mm-node-text"
            style={{ cursor: "pointer", userSelect: "none" }}
            onDoubleClick={() => setEditing(true)}
          >
            <code className="mge-seq-badge">{SHAPE_LABEL[node.shape]}</code>
            {" "}{node.text}
          </span>
        )}
        <div className="mge-seq-spacer" style={{ flex: 1 }} />
        {!editing && (
          <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => setEditing(true)}>edit</button>
        )}
        <button className="mge-seq-btn mge-seq-btn-sm" onClick={() => onAddChild(path)}>+ child</button>
        {!isRoot && (
          <button className="mge-seq-btn mge-seq-btn-sm mge-seq-btn-danger" onClick={() => onDelete(path)}>×</button>
        )}
      </div>
      {node.children.map((child, i) => (
        <NodeRow
          key={i}
          node={child}
          path={[...path, i]}
          isRoot={false}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onAddChild={onAddChild}
        />
      ))}
    </div>
  );
};

export const MindmapEditor = ({ initialSource, onSave, onCancel, renderMermaid }: Props) => {
  const [ir, setIr] = useState<MindmapIR>(() => seed(initialSource));
  const [saving, setSaving] = useState(false);

  const currentSource = useMemo(() => generateMindmap(ir), [ir]);

  const handleSourceEdit = useCallback((next: string): SourceEditOutcome => {
    const out = parseMindmap(next);
    if (!out.ok) return { ok: false, error: out.message };
    setIr(out.ir);
    return { ok: true };
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try { await onSave(currentSource); } finally { setSaving(false); }
  }, [saving, currentSource, onSave]);

  const handleUpdate = useCallback((path: Path, updated: MindmapNode) => {
    setIr((prev) => {
      if (!prev.root) return prev;
      return { ...prev, root: updateNode(prev.root, path, updated) };
    });
  }, []);

  const handleDelete = useCallback((path: Path) => {
    setIr((prev) => {
      if (!prev.root) return prev;
      return { ...prev, root: deleteNode(prev.root, path) };
    });
  }, []);

  const handleAddChild = useCallback((path: Path) => {
    setIr((prev) => {
      if (!prev.root) return prev;
      return { ...prev, root: addChild(prev.root, path) };
    });
  }, []);

  const addRoot = () => {
    setIr({ kind: "mindmap", root: { text: "Root", shape: "circle", children: [] } });
  };

  return (
    <EditorShell
      diagramKind="mindmap"
      currentSource={currentSource}
      onSave={handleSave}
      onCancel={onCancel}
      saving={saving}
      renderMermaid={renderMermaid}
      onSourceEdit={handleSourceEdit}
    >
      <div className="mge-seq-body">
        <section className="mge-seq-section">
          <div className="mge-seq-section-header">
            <span className="mge-seq-section-title">Mindmap tree</span>
            <span className="mge-seq-section-hint" style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>
              ダブルクリックでテキスト・形状を編集
            </span>
          </div>
          {!ir.root ? (
            <div className="mge-seq-empty">
              <p>ルートノードなし。</p>
              <button className="mge-seq-btn" onClick={addRoot}>+ ルート作成</button>
            </div>
          ) : (
            <div className="mge-mm-tree">
              <NodeRow
                node={ir.root}
                path={[]}
                isRoot={true}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                onAddChild={handleAddChild}
              />
            </div>
          )}
        </section>
      </div>
    </EditorShell>
  );
};
