import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { NodeShape } from "../../core/ir-types";
import type { FlowNodeData } from "../adapter";

type ShapeFlowNode = Node<FlowNodeData, "shape">;

/* SVG paths drawn inside a 160x60 viewBox so each shape is visually distinct
   while keeping the bounding box consistent for edge anchoring. */
const W = 160;
const H = 60;

const renderShapeBg = (shape: NodeShape) => {
  const r = `<rect x="2" y="2" width="${W - 4}" height="${H - 4}" />`;
  switch (shape) {
    case "rect":
      return (
        <>
          <rect className="mge-fill" x="2" y="2" width={W - 4} height={H - 4} />
          <rect className="mge-stroke" x="2" y="2" width={W - 4} height={H - 4} />
        </>
      );
    case "round":
      return (
        <>
          <rect className="mge-fill" x="2" y="2" width={W - 4} height={H - 4} rx="10" />
          <rect className="mge-stroke" x="2" y="2" width={W - 4} height={H - 4} rx="10" />
        </>
      );
    case "stadium":
      return (
        <>
          <rect className="mge-fill" x="2" y="2" width={W - 4} height={H - 4} rx={H / 2 - 2} />
          <rect className="mge-stroke" x="2" y="2" width={W - 4} height={H - 4} rx={H / 2 - 2} />
        </>
      );
    case "subroutine":
      return (
        <>
          <rect className="mge-fill" x="2" y="2" width={W - 4} height={H - 4} />
          <rect className="mge-stroke" x="2" y="2" width={W - 4} height={H - 4} />
          <line className="mge-stroke" x1="12" y1="2" x2="12" y2={H - 2} />
          <line className="mge-stroke" x1={W - 12} y1="2" x2={W - 12} y2={H - 2} />
        </>
      );
    case "cylinder":
      return (
        <>
          <path
            className="mge-fill"
            d={`M2,12 C2,5 ${W - 2},5 ${W - 2},12 L${W - 2},${H - 12} C${W - 2},${H - 5} 2,${H - 5} 2,${H - 12} Z`}
          />
          <path
            className="mge-stroke"
            d={`M2,12 C2,5 ${W - 2},5 ${W - 2},12 L${W - 2},${H - 12} C${W - 2},${H - 5} 2,${H - 5} 2,${H - 12} Z`}
          />
          <path className="mge-stroke" d={`M2,12 C2,19 ${W - 2},19 ${W - 2},12`} />
        </>
      );
    case "circle":
      return (
        <>
          <ellipse className="mge-fill" cx={W / 2} cy={H / 2} rx={W / 2 - 2} ry={H / 2 - 2} />
          <ellipse className="mge-stroke" cx={W / 2} cy={H / 2} rx={W / 2 - 2} ry={H / 2 - 2} />
        </>
      );
    case "asymmetric":
      return (
        <>
          <path
            className="mge-fill"
            d={`M14,2 L${W - 2},2 L${W - 2},${H - 2} L14,${H - 2} L2,${H / 2} Z`}
          />
          <path
            className="mge-stroke"
            d={`M14,2 L${W - 2},2 L${W - 2},${H - 2} L14,${H - 2} L2,${H / 2} Z`}
          />
        </>
      );
    case "rhombus":
      return (
        <>
          <path
            className="mge-fill"
            d={`M${W / 2},2 L${W - 2},${H / 2} L${W / 2},${H - 2} L2,${H / 2} Z`}
          />
          <path
            className="mge-stroke"
            d={`M${W / 2},2 L${W - 2},${H / 2} L${W / 2},${H - 2} L2,${H / 2} Z`}
          />
        </>
      );
    case "hexagon":
      return (
        <>
          <path
            className="mge-fill"
            d={`M16,2 L${W - 16},2 L${W - 2},${H / 2} L${W - 16},${H - 2} L16,${H - 2} L2,${H / 2} Z`}
          />
          <path
            className="mge-stroke"
            d={`M16,2 L${W - 16},2 L${W - 2},${H / 2} L${W - 16},${H - 2} L16,${H - 2} L2,${H / 2} Z`}
          />
        </>
      );
    case "parallelogram":
      return (
        <>
          <path
            className="mge-fill"
            d={`M16,2 L${W - 2},2 L${W - 16},${H - 2} L2,${H - 2} Z`}
          />
          <path
            className="mge-stroke"
            d={`M16,2 L${W - 2},2 L${W - 16},${H - 2} L2,${H - 2} Z`}
          />
        </>
      );
    case "parallelogram_alt":
      return (
        <>
          <path
            className="mge-fill"
            d={`M2,2 L${W - 16},2 L${W - 2},${H - 2} L16,${H - 2} Z`}
          />
          <path
            className="mge-stroke"
            d={`M2,2 L${W - 16},2 L${W - 2},${H - 2} L16,${H - 2} Z`}
          />
        </>
      );
    case "trapezoid":
      return (
        <>
          <path
            className="mge-fill"
            d={`M16,2 L${W - 16},2 L${W - 2},${H - 2} L2,${H - 2} Z`}
          />
          <path
            className="mge-stroke"
            d={`M16,2 L${W - 16},2 L${W - 2},${H - 2} L2,${H - 2} Z`}
          />
        </>
      );
    case "trapezoid_alt":
      return (
        <>
          <path
            className="mge-fill"
            d={`M2,2 L${W - 2},2 L${W - 16},${H - 2} L16,${H - 2} Z`}
          />
          <path
            className="mge-stroke"
            d={`M2,2 L${W - 2},2 L${W - 16},${H - 2} L16,${H - 2} Z`}
          />
        </>
      );
    default:
      return <g dangerouslySetInnerHTML={{ __html: r }} />;
  }
};

export const ShapeNode = ({ data, selected }: NodeProps<ShapeFlowNode>) => {
  // Inline CSS variables let users override the theme's fill/stroke per node
  // without touching the shared stylesheet. The SVG inside reads
  // `--mge-node-bg` and `--mge-node-border` via the .mge-fill / .mge-stroke
  // selectors in styles.src.css.
  const style: React.CSSProperties = {};
  if (data.color) (style as Record<string, string>)["--mge-node-bg"] = data.color;
  if (data.borderColor) (style as Record<string, string>)["--mge-node-border"] = data.borderColor;

  return (
    <div className={`mge-shape-node${selected ? " selected" : ""}`} style={style}>
      <svg className="mge-bg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        {renderShapeBg(data.shape)}
      </svg>
      <Handle id="t-top" type="target" position={Position.Top} />
      <Handle id="s-top" type="source" position={Position.Top} />
      <Handle id="t-left" type="target" position={Position.Left} />
      <Handle id="s-left" type="source" position={Position.Left} />
      <div className="mge-label">{data.label || " "}</div>
      <Handle id="s-bottom" type="source" position={Position.Bottom} />
      <Handle id="t-bottom" type="target" position={Position.Bottom} />
      <Handle id="s-right" type="source" position={Position.Right} />
      <Handle id="t-right" type="target" position={Position.Right} />
    </div>
  );
};
