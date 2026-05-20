import type { QuadrantIR, QuadrantItem } from "./ir-types";

const formatValue = (n: number): string => (Number.isInteger(n) ? String(n) : String(n));

const renderItem = (item: QuadrantItem): string => {
  switch (item.type) {
    case "point":
      return `  ${item.name}: [${formatValue(item.x)}, ${formatValue(item.y)}]`;
    case "raw":
      return item.line;
  }
};

export const generateQuadrant = (ir: QuadrantIR): string => {
  const lines: string[] = ["quadrantChart"];

  if (ir.title !== undefined) lines.push(`  title ${ir.title}`);

  if (ir.xAxis) {
    lines.push(
      ir.xAxis.right !== undefined
        ? `  x-axis ${ir.xAxis.left} --> ${ir.xAxis.right}`
        : `  x-axis ${ir.xAxis.left}`,
    );
  }
  if (ir.yAxis) {
    lines.push(
      ir.yAxis.top !== undefined
        ? `  y-axis ${ir.yAxis.bottom} --> ${ir.yAxis.top}`
        : `  y-axis ${ir.yAxis.bottom}`,
    );
  }

  if (ir.quadrants.q1 !== undefined) lines.push(`  quadrant-1 ${ir.quadrants.q1}`);
  if (ir.quadrants.q2 !== undefined) lines.push(`  quadrant-2 ${ir.quadrants.q2}`);
  if (ir.quadrants.q3 !== undefined) lines.push(`  quadrant-3 ${ir.quadrants.q3}`);
  if (ir.quadrants.q4 !== undefined) lines.push(`  quadrant-4 ${ir.quadrants.q4}`);

  for (const item of ir.items) lines.push(renderItem(item));

  return lines.join("\n") + "\n";
};
