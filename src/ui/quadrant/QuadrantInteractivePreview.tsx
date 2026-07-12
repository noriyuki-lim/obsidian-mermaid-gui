import { useEffect, useRef, useState } from "react";
import type { QuadrantIR, QuadrantItem } from "../../core/quadrant/ir-types";
import { useT } from "../EditorHostContext";

interface Props {
  ir: QuadrantIR;
  selected: number | null;
  onPointMove: (index: number, x: number, y: number) => void;
  onSelectPoint: (index: number | null) => void;
}

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

// The plot itself is always 0..100 on both axes. Mermaid renders axis labels
// outside the plotted quadrants (x-axis below, y-axis rotated to the left),
// so the viewBox reserves margin strips for them rather than cramming the
// text inside the 0..100 box.
const PLOT_SIZE = 100;
const MARGIN_LEFT = 16;
const MARGIN_BOTTOM = 12;
const VIEWBOX_WIDTH = PLOT_SIZE + MARGIN_LEFT;
const VIEWBOX_HEIGHT = PLOT_SIZE + MARGIN_BOTTOM;
const VIEWBOX = `${-MARGIN_LEFT} 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`;
// Mermaid's default point radius is small relative to the chart — the
// previous r=2.4 read as oversized next to the real rendering.
const POINT_RADIUS = 1.3;

/**
 * Interactive drag-and-drop quadrant preview. Built bespoke (not via Mermaid
 * render) because the user request is "graphical operation on the preview" —
 * the points themselves must be the manipulation handle, not numeric inputs.
 *
 * IR coordinates are 0..1 with the origin at the bottom-left of the canvas
 * (matching Mermaid's quadrantChart contract), so we flip y when projecting
 * onto the SVG.
 */
export const QuadrantInteractivePreview = ({ ir, selected, onPointMove, onSelectPoint }: Props) => {
  const t = useT();
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ index: number; pointerId: number } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  // Stop a drag if the underlying point disappears mid-gesture.
  useEffect(() => {
    if (dragging != null && dragging >= ir.items.length) {
      dragRef.current = null;
      setDragging(null);
    }
  }, [ir.items.length, dragging]);

  const toLocal = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    // getBoundingClientRect() is the CSS box, which is wider/taller than the
    // "meet"-fitted viewBox content whenever the flex container's aspect
    // ratio doesn't match the viewBox's — that mismatch is exactly what made
    // dragged points lag behind the cursor. getScreenCTM() gives the actual
    // screen-to-viewBox transform (letterboxing and viewBox offset included),
    // so inverting it maps the pointer straight into our 0..100 plot space.
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const point = svg.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const local = point.matrixTransform(ctm.inverse());
    return {
      x: clamp01(local.x / PLOT_SIZE),
      // SVG y grows downwards; IR y grows upwards.
      y: clamp01(1 - local.y / PLOT_SIZE),
    };
  };

  const onPointerDown = (index: number) => (e: React.PointerEvent<SVGElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { index, pointerId: e.pointerId };
    setDragging(index);
    onSelectPoint(index);
  };

  const onPointerMove = (e: React.PointerEvent<SVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const loc = toLocal(e.clientX, e.clientY);
    if (!loc) return;
    onPointMove(drag.index, loc.x, loc.y);
  };

  const onPointerUp = (e: React.PointerEvent<SVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      // already released
    }
    dragRef.current = null;
    setDragging(null);
  };

  const points = ir.items
    .map((item, index) => ({ item, index }))
    .filter(
      (entry): entry is { item: Extract<QuadrantItem, { type: "point" }>; index: number } =>
        entry.item.type === "point",
    );

  return (
    <div className="mge-quad-preview">
      {ir.title ? <div className="mge-quad-preview-title">{ir.title}</div> : null}
      <svg
        ref={svgRef}
        className="mge-quad-preview-svg"
        viewBox={VIEWBOX}
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <rect
          x={0}
          y={0}
          width={100}
          height={100}
          className="mge-quad-bg"
        />
        {/* Quadrant fills, in IR-coord layout:
            q2 top-left, q1 top-right, q3 bottom-left, q4 bottom-right */}
        <rect x={0} y={0} width={50} height={50} className="mge-quad-fill mge-quad-fill-q2" />
        <rect x={50} y={0} width={50} height={50} className="mge-quad-fill mge-quad-fill-q1" />
        <rect x={0} y={50} width={50} height={50} className="mge-quad-fill mge-quad-fill-q3" />
        <rect x={50} y={50} width={50} height={50} className="mge-quad-fill mge-quad-fill-q4" />
        {/* Axes */}
        <line x1={50} y1={0} x2={50} y2={100} className="mge-quad-axis" />
        <line x1={0} y1={50} x2={100} y2={50} className="mge-quad-axis" />
        {/* Quadrant labels — anchored near the top of each quadrant, matching
            Mermaid's own quadrantChart rendering (not vertically centered). */}
        {ir.quadrants.q2 ? (
          <text x={25} y={4} className="mge-quad-label" textAnchor="middle">{ir.quadrants.q2}</text>
        ) : null}
        {ir.quadrants.q1 ? (
          <text x={75} y={4} className="mge-quad-label" textAnchor="middle">{ir.quadrants.q1}</text>
        ) : null}
        {ir.quadrants.q3 ? (
          <text x={25} y={54} className="mge-quad-label" textAnchor="middle">{ir.quadrants.q3}</text>
        ) : null}
        {ir.quadrants.q4 ? (
          <text x={75} y={54} className="mge-quad-label" textAnchor="middle">{ir.quadrants.q4}</text>
        ) : null}
        {/* Axis labels — rendered outside the plotted quadrants, mirroring
            Mermaid's own layout: x-axis below the box, y-axis rotated in the
            left margin. */}
        {ir.xAxis?.left ? (
          <text x={0} y={PLOT_SIZE + 7} className="mge-quad-axis-label" textAnchor="start">{ir.xAxis.left}</text>
        ) : null}
        {ir.xAxis?.right ? (
          <text x={PLOT_SIZE} y={PLOT_SIZE + 7} className="mge-quad-axis-label" textAnchor="end">{ir.xAxis.right}</text>
        ) : null}
        {ir.yAxis?.bottom ? (
          <text
            x={-MARGIN_LEFT / 2}
            y={75}
            transform={`rotate(-90 ${-MARGIN_LEFT / 2} 75)`}
            className="mge-quad-axis-label"
            textAnchor="middle"
          >
            {ir.yAxis.bottom}
          </text>
        ) : null}
        {ir.yAxis?.top ? (
          <text
            x={-MARGIN_LEFT / 2}
            y={25}
            transform={`rotate(-90 ${-MARGIN_LEFT / 2} 25)`}
            className="mge-quad-axis-label"
            textAnchor="middle"
          >
            {ir.yAxis.top}
          </text>
        ) : null}
        {/* Points */}
        {points.map(({ item, index }) => {
          const cx = item.x * 100;
          const cy = (1 - item.y) * 100;
          const isActive = dragging === index;
          const isSelected = selected === index;
          const cls = ["mge-quad-point", isActive && "active", isSelected && "selected"]
            .filter(Boolean)
            .join(" ");
          return (
            <g key={index} className={cls}>
              <circle
                cx={cx}
                cy={cy}
                r={POINT_RADIUS}
                className="mge-quad-point-dot"
                onPointerDown={onPointerDown(index)}
              />
              <text
                x={cx}
                y={cy + POINT_RADIUS + 2.4}
                textAnchor="middle"
                className="mge-quad-point-label"
              >
                {item.name}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mge-quad-preview-help">{t.quadrant.dragHint}</p>
    </div>
  );
};
