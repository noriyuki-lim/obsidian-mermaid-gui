import { PALETTE_SHAPES, SHAPE_BY_KEY } from "../../core/shapes";
import type { Direction, NodeShape } from "../../core/ir-types";
import { useEditorStore } from "../EditorContext";

const PreviewIcon = ({ shape }: { shape: NodeShape }) => {
  const W = 36;
  const H = 24;
  const common = { fill: "#fff", stroke: "#2b245c", strokeWidth: 1.5 };
  switch (shape) {
    case "rect":
      return (
        <svg viewBox={`0 0 ${W} ${H}`}>
          <rect x="2" y="2" width={W - 4} height={H - 4} {...common} />
        </svg>
      );
    case "round":
      return (
        <svg viewBox={`0 0 ${W} ${H}`}>
          <rect x="2" y="2" width={W - 4} height={H - 4} rx="6" {...common} />
        </svg>
      );
    case "stadium":
      return (
        <svg viewBox={`0 0 ${W} ${H}`}>
          <rect x="2" y="2" width={W - 4} height={H - 4} rx={H / 2 - 2} {...common} />
        </svg>
      );
    case "subroutine":
      return (
        <svg viewBox={`0 0 ${W} ${H}`}>
          <rect x="2" y="2" width={W - 4} height={H - 4} {...common} />
          <line x1="6" y1="2" x2="6" y2={H - 2} {...common} />
          <line x1={W - 6} y1="2" x2={W - 6} y2={H - 2} {...common} />
        </svg>
      );
    case "cylinder":
      return (
        <svg viewBox={`0 0 ${W} ${H}`}>
          <path
            d={`M2,5 C2,2 ${W - 2},2 ${W - 2},5 L${W - 2},${H - 5} C${W - 2},${H - 2} 2,${H - 2} 2,${H - 5} Z`}
            {...common}
          />
          <path d={`M2,5 C2,8 ${W - 2},8 ${W - 2},5`} fill="none" stroke="#2b245c" strokeWidth="1.5" />
        </svg>
      );
    case "circle":
      return (
        <svg viewBox={`0 0 ${W} ${H}`}>
          <ellipse cx={W / 2} cy={H / 2} rx={W / 2 - 2} ry={H / 2 - 2} {...common} />
        </svg>
      );
    case "rhombus":
      return (
        <svg viewBox={`0 0 ${W} ${H}`}>
          <path d={`M${W / 2},2 L${W - 2},${H / 2} L${W / 2},${H - 2} L2,${H / 2} Z`} {...common} />
        </svg>
      );
    case "hexagon":
      return (
        <svg viewBox={`0 0 ${W} ${H}`}>
          <path
            d={`M8,2 L${W - 8},2 L${W - 2},${H / 2} L${W - 8},${H - 2} L8,${H - 2} L2,${H / 2} Z`}
            {...common}
          />
        </svg>
      );
    case "asymmetric":
      return (
        <svg viewBox={`0 0 ${W} ${H}`}>
          <path d={`M8,2 L${W - 2},2 L${W - 2},${H - 2} L8,${H - 2} L2,${H / 2} Z`} {...common} />
        </svg>
      );
    case "parallelogram":
      return (
        <svg viewBox={`0 0 ${W} ${H}`}>
          <path d={`M8,2 L${W - 2},2 L${W - 8},${H - 2} L2,${H - 2} Z`} {...common} />
        </svg>
      );
    case "trapezoid":
      return (
        <svg viewBox={`0 0 ${W} ${H}`}>
          <path d={`M8,2 L${W - 8},2 L${W - 2},${H - 2} L2,${H - 2} Z`} {...common} />
        </svg>
      );
    default:
      return null;
  }
};

export const Palette = () => {
  const addNode = useEditorStore((s) => s.addNode);
  const direction = useEditorStore((s) => s.ir.direction);
  const setDirection = useEditorStore((s) => s.setDirection);
  const addSubgraph = useEditorStore((s) => s.addSubgraph);

  const onDragStart = (shape: NodeShape) => (e: React.DragEvent) => {
    e.dataTransfer.setData("application/x-mermaid-shape", shape);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <aside className="mge-palette">
      <section className="mge-palette-controls" aria-label="Flowchart structure controls">
        <div className="mge-palette-control">
          <h3>Direction</h3>
          <select
            id="mge-flow-dir"
            className="mge-palette-select"
            aria-label="Flowchart direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as Direction)}
          >
            <option value="TD">Top-Down</option>
            <option value="LR">Left-Right</option>
            <option value="BT">Bottom-Top</option>
            <option value="RL">Right-Left</option>
          </select>
        </div>

        <div className="mge-palette-control">
          <h3>Subgraph</h3>
          <button
            type="button"
            className="mge-palette-action"
            onClick={() => addSubgraph()}
            title="Wrap selected nodes in a new subgraph"
          >
            + Subgraph
          </button>
        </div>
      </section>

      <h3>Shapes</h3>
      {PALETTE_SHAPES.map((s) => (
        <div
          key={s}
          className="mge-palette-item"
          draggable
          onDragStart={onDragStart(s)}
          onDoubleClick={() => addNode(s)}
          title="Drag onto canvas, or double-click to add"
        >
          <PreviewIcon shape={s} />
          <span>{SHAPE_BY_KEY[s].display}</span>
        </div>
      ))}
      <p style={{ color: "var(--mge-text-muted)", fontSize: 11, marginTop: 12 }}>
        Drag a shape onto the canvas or double-click to add at the origin.
      </p>
    </aside>
  );
};
