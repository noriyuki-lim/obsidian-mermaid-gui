import type { QuadrantIR, QuadrantItem } from "./ir-types";

const formatValue = (n: number): string => (Number.isInteger(n) ? String(n) : String(n));

// The parser strips surrounding quotes from these free-text fields (so the
// GUI's inputs/preview show plain text), so the generator must always add
// them back. Mermaid requires quotes whenever the text contains characters
// like `(`, `)`, or `-->`-lookalikes that would otherwise break its
// line-based parsing — always quoting is what keeps arbitrary label text
// round-tripping through real Mermaid instead of just our own parser.
const quote = (s: string): string => `"${s}"`;

const renderItem = (item: QuadrantItem): string => {
  switch (item.type) {
    case "point":
      return `  ${quote(item.name)}: [${formatValue(item.x)}, ${formatValue(item.y)}]`;
    case "raw":
      return item.line;
  }
};

export const generateQuadrant = (ir: QuadrantIR): string => {
  const lines: string[] = ["quadrantChart"];

  if (ir.title !== undefined) lines.push(`  title ${quote(ir.title)}`);

  if (ir.xAxis) {
    lines.push(
      ir.xAxis.right !== undefined
        ? `  x-axis ${quote(ir.xAxis.left)} --> ${quote(ir.xAxis.right)}`
        : `  x-axis ${quote(ir.xAxis.left)}`,
    );
  }
  if (ir.yAxis) {
    lines.push(
      ir.yAxis.top !== undefined
        ? `  y-axis ${quote(ir.yAxis.bottom)} --> ${quote(ir.yAxis.top)}`
        : `  y-axis ${quote(ir.yAxis.bottom)}`,
    );
  }

  if (ir.quadrants.q1 !== undefined) lines.push(`  quadrant-1 ${quote(ir.quadrants.q1)}`);
  if (ir.quadrants.q2 !== undefined) lines.push(`  quadrant-2 ${quote(ir.quadrants.q2)}`);
  if (ir.quadrants.q3 !== undefined) lines.push(`  quadrant-3 ${quote(ir.quadrants.q3)}`);
  if (ir.quadrants.q4 !== undefined) lines.push(`  quadrant-4 ${quote(ir.quadrants.q4)}`);

  for (const item of ir.items) lines.push(renderItem(item));

  return lines.join("\n") + "\n";
};
