import type { XYAxis, XYChartIR, XYItem } from "./ir-types";

const alwaysQuote = (s: string): string => `"${s.replace(/"/g, '\\"')}"`;

const quoteCategory = (s: string): string => (/[\s",]/.test(s) ? alwaysQuote(s) : s);

const renderTitle = (title: string): string => `  title ${alwaysQuote(title)}`;

const renderAxis = (kind: "x-axis" | "y-axis", axis: XYAxis): string => {
  switch (axis.kind) {
    case "numeric": {
      const titlePart = axis.title ? `${alwaysQuote(axis.title)} ` : "";
      return `  ${kind} ${titlePart}${axis.min} --> ${axis.max}`;
    }
    case "categorical": {
      const titlePart = axis.title ? `${alwaysQuote(axis.title)} ` : "";
      const cats = axis.categories.map(quoteCategory).join(", ");
      return `  ${kind} ${titlePart}[${cats}]`;
    }
    case "label-only":
      return `  ${kind} ${alwaysQuote(axis.title)}`;
  }
};

const renderItem = (item: XYItem): string => {
  switch (item.type) {
    case "series": {
      const titleComment = item.title ? ` %% gui:seriesTitle ${item.title}` : "";
      return `  ${item.series} [${item.values.join(", ")}]${titleComment}`;
    }
    case "raw":
      return item.line;
  }
};

export const generateXYChart = (ir: XYChartIR): string => {
  const lines: string[] = [];
  for (const raw of ir.leadingRawLines) lines.push(raw);
  lines.push(ir.orientation === "horizontal" ? "xychart-beta horizontal" : "xychart-beta");

  if (ir.title !== undefined) lines.push(renderTitle(ir.title));
  if (ir.xAxis) lines.push(renderAxis("x-axis", ir.xAxis));
  if (ir.yAxis) lines.push(renderAxis("y-axis", ir.yAxis));

  for (const item of ir.items) lines.push(renderItem(item));

  return lines.join("\n") + "\n";
};
