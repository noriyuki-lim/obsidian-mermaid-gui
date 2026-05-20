import { useEffect, useRef, useState } from "react";
import type { QuadrantIR, QuadrantItem } from "../../core/quadrant/ir-types";

interface Props {
  ir: QuadrantIR;
  onPointMove: (index: number, x: number, y: number) => void;
}

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/**
 * Interactive drag-and-drop quadrant preview. Built bespoke (not via Mermaid
 * render) because the user request is "graphical operation on the preview" —
 * the points themselves must be the manipulation handle, not numeric inputs.
 *
 * IR coordinates are 0..1 with the origin at the bottom-left of the canvas
 * (matching Mermaid's quadrantChart contract), so we flip y when projecting
 * onto the SVG.
 */
export const QuadrantInteractivePreview = ({ ir, onPointMove }: Props) => {
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
    const rect = svg.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (w <= 0 || h <= 0) return null;
    return {
      x: clamp01((clientX - rect.left) / w),
      // SVG y grows downwards; IR y grows upwards.
      y: clamp01(1 - (clientY - rect.top) / h),
    };
  };

  const onPointerDown = (index: number) => (e: React.PointerEvent<SVGElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = { index, pointerId: e.pointerId };
    setDragging(index);
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
        viewBox="0 0 100 100"
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
        {/* Quadrant labels */}
        {ir.quadrants.q2 ? (
          <text x={25} y={25} className="mge-quad-label" textAnchor="middle">{ir.quadrants.q2}</text>
        ) : null}
        {ir.quadrants.q1 ? (
          <text x={75} y={25} className="mge-quad-label" textAnchor="middle">{ir.quadrants.q1}</text>
        ) : null}
        {ir.quadrants.q3 ? (
          <text x={25} y={75} className="mge-quad-label" textAnchor="middle">{ir.quadrants.q3}</text>
        ) : null}
        {ir.quadrants.q4 ? (
          <text x={75} y={75} className="mge-quad-label" textAnchor="middle">{ir.quadrants.q4}</text>
        ) : null}
        {/* Axis labels */}
        {ir.xAxis?.left ? (
          <text x={2} y={98} className="mge-quad-axis-label" textAnchor="start">{ir.xAxis.left}</text>
        ) : null}
        {ir.xAxis?.right ? (
          <text x={98} y={98} className="mge-quad-axis-label" textAnchor="end">{ir.xAxis.right}</text>
        ) : null}
        {ir.yAxis?.bottom ? (
          <text x={2} y={98} className="mge-quad-axis-label" textAnchor="start" dy={-10}>{ir.yAxis.bottom}</text>
        ) : null}
        {ir.yAxis?.top ? (
          <text x={2} y={4} className="mge-quad-axis-label" textAnchor="start">{ir.yAxis.top}</text>
        ) : null}
        {/* Points */}
        {points.map(({ item, index }) => {
          const cx = item.x * 100;
          const cy = (1 - item.y) * 100;
          const isActive = dragging === index;
          return (
            <g key={index} className={isActive ? "mge-quad-point active" : "mge-quad-point"}>
              <circle
                cx={cx}
                cy={cy}
                r={2.4}
                className="mge-quad-point-dot"
                onPointerDown={onPointerDown(index)}
              />
              <text
                x={cx + 3}
                y={cy - 3}
                className="mge-quad-point-label"
              >
                {item.name}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mge-quad-preview-help">
        ポイントをドラッグして位置を編集
      </p>
    </div>
  );
};
